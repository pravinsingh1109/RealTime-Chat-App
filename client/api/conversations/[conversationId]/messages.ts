import type { VercelResponse } from '@vercel/node';
import { ApiError } from '../../_lib/errors.js';
import { handleServerless, type AuthenticatedVercelRequest } from '../../_lib/handler.js';
import { Message } from '../../_lib/models/Message.js';
import { getMemberConversation } from '../../_lib/services/conversation.service.js';
import { createChatMessage } from '../../_lib/services/message.service.js';
import { serializeId, serializeMessage } from '../../_lib/serializers.js';
import { broadcastToUserRooms } from '../../_lib/supabase.js';
import { sendMessageSchema } from '../../_lib/validators/conversation.js';

export default handleServerless(async (req: AuthenticatedVercelRequest, res: VercelResponse) => {
  const rawId = Array.isArray(req.query.conversationId) ? req.query.conversationId[0] : req.query.conversationId;
  const urlMatch = req.url ? req.url.match(/\/api\/conversations\/([^/?#]+)/) : null;
  const conversationId = rawId || (urlMatch ? urlMatch[1] : undefined);
  if (!conversationId) {
    throw new ApiError(400, 'Conversation ID is required.', 'CONVERSATION_ID_REQUIRED');
  }

  const userId = req.userId;
  const conversation = await getMemberConversation(conversationId, userId);

  if (req.method === 'GET') {
    const rawCursor = typeof req.query.cursor === 'string' ? req.query.cursor : undefined;
    const cursor = rawCursor ? new Date(rawCursor) : undefined;
    if (cursor && Number.isNaN(cursor.valueOf())) {
      throw new ApiError(400, 'Invalid message cursor.', 'INVALID_CURSOR');
    }

    const records = await Message.find({
      conversation: conversation._id,
      ...(cursor ? { createdAt: { $lt: cursor } } : {}),
    })
      .sort({ createdAt: -1 })
      .limit(50)
      .populate('sender', 'displayName email avatarUrl lastSeen createdAt');

    const nextCursor = records.length === 50 ? records[records.length - 1]?.createdAt.toISOString() : undefined;
    res.status(200).json({ messages: records.reverse().map(serializeMessage), nextCursor });
    return;
  }

  if (req.method === 'POST') {
    const input = sendMessageSchema.parse(req.body);
    const message = await createChatMessage({
      conversationId,
      senderId: userId,
      ...input,
    });
    const serialized = serializeMessage(message);

    const memberIds = conversation.members.map(serializeId);
    await broadcastToUserRooms(memberIds, 'message:new', serialized);

    res.status(201).json({ message: serialized });
    return;
  }

  res.status(405).json({ error: { code: 'METHOD_NOT_ALLOWED', message: 'Method not allowed' } });
}, { requireAuth: true });
