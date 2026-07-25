import type { Types } from 'mongoose';
import { Conversation, type ConversationDocument } from '../models/Conversation.js';
import { ApiError } from '../errors.js';
import { serializeId } from '../serializers.js';

export function isConversationMember(conversation: ConversationDocument, userId: string): boolean {
  return conversation.members.some((member) => serializeId(member) === userId);
}

export async function getMemberConversation(
  conversationId: string,
  userId: string
): Promise<ConversationDocument> {
  const conversation = await Conversation.findById(conversationId);

  if (!conversation) {
    throw new ApiError(404, 'Conversation not found.', 'CONVERSATION_NOT_FOUND');
  }

  if (!isConversationMember(conversation, userId)) {
    throw new ApiError(403, 'You are not a member of this conversation.', 'CONVERSATION_ACCESS_DENIED');
  }

  return conversation;
}

export function assertGroupOwner(conversation: ConversationDocument, userId: string): void {
  if (conversation.kind !== 'group' || !conversation.group) {
    throw new ApiError(400, 'This action is only available for group conversations.', 'GROUP_REQUIRED');
  }

  if (serializeId(conversation.group.createdBy) !== userId) {
    throw new ApiError(403, 'Only the group creator can perform this action.', 'GROUP_OWNER_REQUIRED');
  }
}

export async function populateConversation(conversation: ConversationDocument): Promise<ConversationDocument> {
  await conversation.populate([
    { path: 'members', select: 'displayName email avatarUrl lastSeen createdAt' },
    {
      path: 'lastMessage',
      populate: { path: 'sender', select: 'displayName email avatarUrl lastSeen createdAt' },
    },
  ]);
  return conversation;
}

export function uniqueObjectIdStrings(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()))];
}

export function includesMember(members: Types.ObjectId[], userId: string): boolean {
  return members.some((member) => serializeId(member) === userId);
}
