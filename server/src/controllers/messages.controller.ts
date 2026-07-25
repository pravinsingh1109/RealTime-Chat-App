import type { RequestHandler } from 'express';
import type { Server } from 'socket.io';
import { currentUserId } from '../middleware/auth.js';
import { createChatMessage, markConversationRead } from '../services/message.service.js';
import { serializeMessage } from '../utils/serializers.js';
import { seenMessageSchema, sendMessageSchema } from '../validators/conversation.js';

export const sendMessage: RequestHandler = async (request, response) => {
  const userId = currentUserId(request);
  const input = sendMessageSchema.parse(request.body);
  const message = await createChatMessage({ conversationId: String(request.params.conversationId), senderId: userId, ...input });
  const serialized = serializeMessage(message);
  const io = request.app.get('io') as Server | undefined;
  io?.to(`conversation:${String(request.params.conversationId)}`).emit('message:new', serialized);
  response.status(201).json({ message: serialized });
};

export const markMessagesSeen: RequestHandler = async (request, response) => {
  const userId = currentUserId(request);
  const { messageId } = seenMessageSchema.parse(request.body ?? {});
  const result = await markConversationRead({ conversationId: String(request.params.conversationId), userId, messageId });
  const payload = { conversationId: String(request.params.conversationId), messageId: result.messageId, userId, readAt: result.readAt };
  const io = request.app.get('io') as Server | undefined;
  io?.to(`conversation:${String(request.params.conversationId)}`).emit('message:seen', payload);
  response.json(payload);
};
