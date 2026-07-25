import type { VercelResponse } from '@vercel/node';
import { ApiError } from '../../_lib/errors.js';
import { handleServerless, type AuthenticatedVercelRequest } from '../../_lib/handler.js';
import { getMemberConversation } from '../../_lib/services/conversation.service.js';
import { markConversationRead } from '../../_lib/services/message.service.js';
import { serializeId } from '../../_lib/serializers.js';
import { broadcastToUserRooms } from '../../_lib/supabase.js';
import { seenMessageSchema } from '../../_lib/validators/conversation.js';

export default handleServerless(async (req: AuthenticatedVercelRequest, res: VercelResponse) => {
  if (req.method !== 'POST') {
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
  const { messageId } = seenMessageSchema.parse(req.body ?? {});

  const result = await markConversationRead({ conversationId, userId, messageId });
  const payload = { conversationId, messageId: result.messageId, userId, readAt: result.readAt };

  const conversation = await getMemberConversation(conversationId, userId);
  const memberIds = conversation.members.map(serializeId);
  await broadcastToUserRooms(memberIds, 'message:seen', payload);

  res.status(200).json(payload);
}, { requireAuth: true });
