import type { VercelResponse } from '@vercel/node';
import { ApiError } from '../../_lib/errors.js';
import { handleServerless, type AuthenticatedVercelRequest } from '../../_lib/handler.js';
import { requireObjectId } from '../../_lib/id.js';
import { Message } from '../../_lib/models/Message.js';
import { User } from '../../_lib/models/User.js';
import { assertGroupOwner, getMemberConversation, populateConversation, uniqueObjectIdStrings } from '../../_lib/services/conversation.service.js';
import { serializeConversation, serializeId } from '../../_lib/serializers.js';
import { broadcastToUserRooms } from '../../_lib/supabase.js';
import { updateMembersSchema } from '../../_lib/validators/conversation.js';

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

  const conversationId = Array.isArray(req.query.conversationId) ? req.query.conversationId[0] : req.query.conversationId;
  if (!conversationId) {
    throw new ApiError(400, 'Conversation ID is required.', 'CONVERSATION_ID_REQUIRED');
  }

  const userId = req.userId;
  const { memberIds } = updateMembersSchema.parse(req.body);
  const conversation = await getMemberConversation(conversationId, userId);
  assertGroupOwner(conversation, userId);

  const additions = uniqueObjectIdStrings(memberIds);
  additions.forEach((id) => requireObjectId(id, 'member id'));
  if (await User.countDocuments({ _id: { $in: additions } }) !== additions.length) {
    throw new ApiError(404, 'One or more group members do not exist.', 'USER_NOT_FOUND');
  }

  const members = uniqueObjectIdStrings([...conversation.members.map(String), ...additions]);
  if (members.length > 100) {
    throw new ApiError(400, 'Groups can have at most 100 members.', 'GROUP_MEMBER_LIMIT');
  }
  conversation.members = members.map((id) => requireObjectId(id, 'member id'));
  await conversation.save();

  const populated = await populateConversation(conversation);
  const serialized = await serializeForUser(populated, userId);

  const allMemberIds = conversation.members.map(serializeId);
  await broadcastToUserRooms(allMemberIds, 'conversation:update', { conversation: serialized });

  res.status(200).json({ conversation: serialized });
}, { requireAuth: true });
