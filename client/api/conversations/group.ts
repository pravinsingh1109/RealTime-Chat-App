import type { VercelResponse } from '@vercel/node';
import { ApiError } from '../_lib/errors.js';
import { handleServerless, type AuthenticatedVercelRequest } from '../_lib/handler.js';
import { requireObjectId } from '../_lib/id.js';
import { Conversation } from '../_lib/models/Conversation.js';
import { Message } from '../_lib/models/Message.js';
import { User } from '../_lib/models/User.js';
import { populateConversation, uniqueObjectIdStrings } from '../_lib/services/conversation.service.js';
import { serializeConversation } from '../_lib/serializers.js';
import { broadcastToUserRooms } from '../_lib/supabase.js';
import { createGroupConversationSchema } from '../_lib/validators/conversation.js';

async function serializeForUser(conversation: Awaited<ReturnType<typeof populateConversation>>, userId: string) {
  const unreadCount = await Message.countDocuments({
    conversation: conversation._id,
    sender: { $ne: userId },
    'readBy.user': { $ne: userId },
  });
  return { ...serializeConversation(conversation), unreadCount };
}

export default handleServerless(async (req: AuthenticatedVercelRequest, res: VercelResponse) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: { code: 'METHOD_NOT_ALLOWED', message: 'Method not allowed' } });
    return;
  }

  const userId = req.userId;
  const input = createGroupConversationSchema.parse(req.body);
  const memberIds = uniqueObjectIdStrings([userId, ...input.memberIds]);

  if (memberIds.length < 2) {
    throw new ApiError(400, 'A group needs at least one other member.', 'GROUP_MEMBERS_REQUIRED');
  }
  memberIds.forEach((id) => requireObjectId(id, 'member id'));
  if (await User.countDocuments({ _id: { $in: memberIds } }) !== memberIds.length) {
    throw new ApiError(404, 'One or more group members do not exist.', 'USER_NOT_FOUND');
  }

  const conversation = await Conversation.create({
    kind: 'group',
    members: memberIds,
    group: {
      name: input.name,
      description: input.description,
      avatarUrl: input.avatarUrl,
      createdBy: userId,
    },
  });

  const populated = await populateConversation(conversation);
  const serialized = await serializeForUser(populated, userId);

  await broadcastToUserRooms(memberIds, 'conversation:update', { conversation: serialized });

  res.status(201).json({ conversation: serialized });
}, { requireAuth: true });
