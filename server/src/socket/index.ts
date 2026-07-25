import type { Server as HttpServer } from 'node:http';
import { Server } from 'socket.io';
import { z } from 'zod';
import { corsOrigins } from '../config/env.js';
import { getMemberConversation } from '../services/conversation.service.js';
import { createChatMessage, markConversationRead } from '../services/message.service.js';
import { serializeId, serializeMessage } from '../utils/serializers.js';
import { verifyAccessToken, type AuthenticatedUser } from '../utils/token.js';

declare module 'socket.io' { interface SocketData { auth: AuthenticatedUser; } }
const sendSchema = z.object({
  conversationId: z.string().trim().min(1), kind: z.enum(['text', 'image']).optional(), type: z.enum(['text', 'image']).optional(),
  content: z.string().trim().max(4000).optional(), imageUrl: z.string().trim().max(500).optional(),
  clientMessageId: z.string().trim().min(1).max(100).optional(), clientId: z.string().trim().min(1).max(100).optional()
}).strict().superRefine((value, context) => {
  const kind = value.kind ?? value.type ?? (value.imageUrl ? 'image' : 'text');
  if (kind === 'text' && !value.content) context.addIssue({ code: z.ZodIssueCode.custom, path: ['content'], message: 'Text is required.' });
  if (kind === 'image' && !value.imageUrl) context.addIssue({ code: z.ZodIssueCode.custom, path: ['imageUrl'], message: 'Image URL is required.' });
});
const conversationSchema = z.object({ conversationId: z.string().trim().min(1) }).strict();
const seenSchema = conversationSchema.extend({ messageId: z.string().trim().min(1).optional(), messageIds: z.array(z.string().trim().min(1)).max(50).optional() }).strict();
const userRoom = (userId: string) => `user:${userId}`;
const fail = (ack: unknown, error: unknown) => { if (typeof ack === 'function') ack({ error: error instanceof Error ? error.message : 'Request failed.' }); };

export function setupSocket(server: HttpServer): Server {
  const io = new Server(server, { cors: { origin: corsOrigins, credentials: false } });
  const online = new Map<string, number>();
  io.use((socket, next) => {
    try { socket.data.auth = verifyAccessToken(typeof socket.handshake.auth?.token === 'string' ? socket.handshake.auth.token : ''); next(); }
    catch { next(new Error('Authentication required.')); }
  });
  io.on('connection', (socket) => {
    const userId = socket.data.auth.userId;
    socket.join(userRoom(userId));
    const sockets = (online.get(userId) ?? 0) + 1;
    online.set(userId, sockets);
    if (sockets === 1) socket.broadcast.emit('presence:update', { userId, isOnline: true });
    socket.emit('online-users', [...online.keys()]);
    socket.on('conversation:join', async (raw, ack) => {
      try { const { conversationId } = conversationSchema.parse(raw); await getMemberConversation(conversationId, userId); socket.join(`conversation:${conversationId}`); if (typeof ack === 'function') ack({ ok: true }); }
      catch (error) { fail(ack, error); }
    });
    socket.on('typing:update', async (raw, ack) => {
      try {
        const input = conversationSchema.extend({ isTyping: z.boolean() }).parse(raw);
        const conversation = await getMemberConversation(input.conversationId, userId);
        for (const member of conversation.members.map(serializeId)) if (member !== userId) io.to(userRoom(member)).emit('typing:update', { conversationId: input.conversationId, user: { id: userId }, isTyping: input.isTyping });
        if (typeof ack === 'function') ack({ ok: true });
      } catch (error) { fail(ack, error); }
    });
    socket.on('message:send', async (raw, ack) => {
      try {
        const input = sendSchema.parse(raw);
        const message = await createChatMessage({ conversationId: input.conversationId, senderId: userId, kind: input.kind ?? input.type, content: input.content, imageUrl: input.imageUrl, clientMessageId: input.clientMessageId ?? input.clientId });
        const serialized = serializeMessage(message);
        const conversation = await getMemberConversation(input.conversationId, userId);
        for (const member of conversation.members.map(serializeId)) io.to(userRoom(member)).emit('message:new', serialized);
        if (typeof ack === 'function') ack({ message: serialized });
      } catch (error) { fail(ack, error); }
    });
    socket.on('message:seen', async (raw, ack) => {
      try {
        const input = seenSchema.parse(raw);
        const ids = input.messageIds?.length ? input.messageIds : input.messageId ? [input.messageId] : [];
        const receipts = ids.length ? await Promise.all(ids.map((messageId) => markConversationRead({ conversationId: input.conversationId, userId, messageId }))) : [await markConversationRead({ conversationId: input.conversationId, userId })];
        const conversation = await getMemberConversation(input.conversationId, userId);
        for (const receipt of receipts) {
          const payload = { conversationId: input.conversationId, messageId: receipt.messageId, userId, readAt: receipt.readAt };
          for (const member of conversation.members.map(serializeId)) io.to(userRoom(member)).emit('message:seen', payload);
        }
        if (typeof ack === 'function') ack({ ok: true });
      } catch (error) { fail(ack, error); }
    });
    socket.on('disconnect', () => {
      const remaining = (online.get(userId) ?? 1) - 1;
      if (remaining > 0) online.set(userId, remaining);
      else { online.delete(userId); socket.broadcast.emit('presence:update', { userId, isOnline: false }); }
    });
  });
  return io;
}
