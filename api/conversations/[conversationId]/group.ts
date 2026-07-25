import type { VercelResponse } from '@vercel/node';
import { ApiError } from '../../_lib/errors.js';
import { handleServerless, type AuthenticatedVercelRequest } from '../../_lib/handler.js';
import { Message } from '../../_lib/models/Message.js';
import { assertGroupOwner, getMemberConversation, populateConversation } from '../../_lib/services/conversation.service.js';
import { serializeConversation, serializeId } from '../../_lib/serializers.js';
import { broadcastToUserRooms } from '../../_lib/supabase.js';
import { updateGroupConversationSchema } from '../../_lib/validators/conversation.js';

async function serializeForUser(conversation: Awaited<ReturnType<typeof populateConversation>>, userId: string) {
  const unreadCount = await Message.countDocuments({
    conversation: conversation._id,
    sender: { $ne: userId },
    'readBy.user': { $ne: userId },
  });
  return { ...serializeConversation(conversation), unreadCount };
}

export default handleServerless(async (req: AuthenticatedVercelRequest, res: VercelResponse) => {
  if (req.method !== 'PATCH') {
    res.status(405).json({ error: { code: 'METHOD_NOT_ALLOWED', message: 'Method not allowed' } });
    return;
  }

  const rawId = Array.isArray(req.query.conversationId) ? req.query.conversationId[0] : req.query.conversationId;
  const urlMatch = req.url ? req.url.match(/\/api\/conversations\/([^/?#]+)/) : null;
  const conversationId = rawId || (urlMatch ? urlMatch[1] : undefined);
  if (!conversationId) {
    throw new ApiError(400, 'Conversation ID is required.', 'CONVERSATION_ID_REQUIRED');
  }

  const userId = req.userId;
  const input = updateGroupConversationSchema.parse(req.body);
  const conversation = await getMemberConversation(conversationId, userId);
  assertGroupOwner(conversation, userId);

  if (!conversation.group) {
    throw new ApiError(400, 'Group details are missing.', 'GROUP_REQUIRED');
  }
  if (input.name !== undefined) conversation.group.name = input.name;
  if (input.description !== undefined) conversation.group.description = input.description ?? undefined;
  if (input.avatarUrl !== undefined) conversation.group.avatarUrl = input.avatarUrl ?? undefined;

  await conversation.save();
  const populated = await populateConversation(conversation);
  const serialized = await serializeForUser(populated, userId);

  const memberIds = conversation.members.map(serializeId);
  await broadcastToUserRooms(memberIds, 'conversation:update', { conversation: serialized });

  res.status(200).json({ conversation: serialized });
}, { requireAuth: true });
