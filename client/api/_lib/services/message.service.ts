import { Conversation } from '../models/Conversation.js';
import { Message, type MessageDocument, type MessageKind } from '../models/Message.js';
import { getMemberConversation } from './conversation.service.js';

export interface CreateMessageInput {
  conversationId: string;
  senderId: string;
  kind?: 'text' | 'image';
  content?: string;
  imageUrl?: string;
  clientMessageId?: string;
}

export async function populateMessage(message: MessageDocument): Promise<MessageDocument> {
  await message.populate('sender', 'displayName email avatarUrl lastSeen createdAt');
  return message;
}

export async function createChatMessage(input: CreateMessageInput): Promise<MessageDocument> {
  const conversation = await getMemberConversation(input.conversationId, input.senderId);
  const kind: MessageKind = input.kind ?? (input.imageUrl ? 'image' : 'text');

  if (input.clientMessageId) {
    const existing = await Message.findOne({
      conversation: conversation._id,
      sender: input.senderId,
      clientMessageId: input.clientMessageId,
    });
    if (existing) return populateMessage(existing);
  }

  let message: MessageDocument;
  try {
    message = await Message.create({
      conversation: conversation._id,
      sender: input.senderId,
      kind,
      content: input.content?.trim(),
      imageUrl: input.imageUrl,
      clientMessageId: input.clientMessageId,
      readBy: [{ user: input.senderId, readAt: new Date() }],
    });
  } catch (error) {
    const duplicate = error as { code?: number };
    if (duplicate.code === 11000 && input.clientMessageId) {
      const existing = await Message.findOne({
        conversation: conversation._id,
        sender: input.senderId,
        clientMessageId: input.clientMessageId,
      });
      if (existing) return populateMessage(existing);
    }
    throw error;
  }

  await Conversation.findByIdAndUpdate(conversation._id, { lastMessage: message._id }, { timestamps: true });
  return populateMessage(message);
}

export interface MarkReadInput {
  conversationId: string;
  userId: string;
  messageId?: string;
}

export async function markConversationRead(input: MarkReadInput): Promise<{ readAt: Date; messageId?: string }> {
  const conversation = await getMemberConversation(input.conversationId, input.userId);
  let beforeOrAt: Date | undefined;

  if (input.messageId) {
    const targetMessage = await Message.findOne({ _id: input.messageId, conversation: conversation._id });
    if (targetMessage) {
      beforeOrAt = targetMessage.createdAt;
    }
  }

  const readAt = new Date();
  const filter: Record<string, unknown> = {
    conversation: conversation._id,
    sender: { $ne: input.userId },
    'readBy.user': { $ne: input.userId },
  };
  if (beforeOrAt) filter.createdAt = { $lte: beforeOrAt };

  await Message.updateMany(filter, {
    $push: { readBy: { user: input.userId, readAt } },
  });

  return { readAt, messageId: input.messageId };
}
