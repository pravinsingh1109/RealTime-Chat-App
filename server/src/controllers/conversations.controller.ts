import type { RequestHandler } from 'express';

import { ApiError } from '../errors/ApiError.js';
import { currentUserId } from '../middleware/auth.js';
import { Conversation } from '../models/Conversation.js';
import { Message } from '../models/Message.js';
import { User } from '../models/User.js';
import { assertGroupOwner, getMemberConversation, populateConversation, uniqueObjectIdStrings } from '../services/conversation.service.js';
import { canonicalDirectKey, requireObjectId } from '../utils/id.js';
import { serializeConversation, serializeMessage } from '../utils/serializers.js';
import { createDirectConversationSchema, createGroupConversationSchema, updateGroupConversationSchema, updateMembersSchema } from '../validators/conversation.js';

async function serializeForUser(conversation: Awaited<ReturnType<typeof populateConversation>>, userId: string) {
  const unreadCount = await Message.countDocuments({ conversation: conversation._id, sender: { $ne: userId }, 'readBy.user': { $ne: userId } });
  return { ...serializeConversation(conversation), unreadCount };
}

export const listConversations: RequestHandler = async (request, response) => {
  const userId = currentUserId(request);
  const records = await Conversation.find({ members: userId }).sort({ updatedAt: -1 });
  const populated = await Promise.all(records.map(populateConversation));
  response.json({ conversations: await Promise.all(populated.map((conversation) => serializeForUser(conversation, userId))) });
};

export const createDirectConversation: RequestHandler = async (request, response) => {
  const userId = currentUserId(request);
  const { participantId } = createDirectConversationSchema.parse(request.body);
  requireObjectId(participantId, 'participant id');
  if (participantId === userId) throw new ApiError(400, 'You cannot start a direct conversation with yourself.', 'INVALID_PARTICIPANT');
  if (!await User.exists({ _id: participantId })) throw new ApiError(404, 'Participant not found.', 'USER_NOT_FOUND');
  const directKey = canonicalDirectKey(userId, participantId);
  let conversation = await Conversation.findOne({ directKey });
  if (!conversation) {
    try { conversation = await Conversation.create({ kind: 'direct', members: [userId, participantId], directKey }); }
    catch (error) {
      if ((error as { code?: number }).code !== 11000) throw error;
      conversation = await Conversation.findOne({ directKey });
    }
  }
  if (!conversation) throw new ApiError(500, 'Could not create the conversation.', 'CONVERSATION_CREATE_FAILED');
  response.status(201).json({ conversation: await serializeForUser(await populateConversation(conversation), userId) });
};

export const createGroupConversation: RequestHandler = async (request, response) => {
  const userId = currentUserId(request);
  const input = createGroupConversationSchema.parse(request.body);
  const memberIds = uniqueObjectIdStrings([userId, ...input.memberIds]);
  if (memberIds.length < 2) throw new ApiError(400, 'A group needs at least one other member.', 'GROUP_MEMBERS_REQUIRED');
  memberIds.forEach((id) => requireObjectId(id, 'member id'));
  if (await User.countDocuments({ _id: { $in: memberIds } }) !== memberIds.length) throw new ApiError(404, 'One or more group members do not exist.', 'USER_NOT_FOUND');
  const conversation = await Conversation.create({ kind: 'group', members: memberIds, group: { name: input.name, description: input.description, avatarUrl: input.avatarUrl, createdBy: userId } });
  response.status(201).json({ conversation: await serializeForUser(await populateConversation(conversation), userId) });
};

export const updateGroupConversation: RequestHandler = async (request, response) => {
  const userId = currentUserId(request);
  const input = updateGroupConversationSchema.parse(request.body);
  const conversation = await getMemberConversation(String(request.params.conversationId), userId);
  assertGroupOwner(conversation, userId);
  if (!conversation.group) throw new ApiError(400, 'Group details are missing.', 'GROUP_REQUIRED');
  if (input.name !== undefined) conversation.group.name = input.name;
  if (input.description !== undefined) conversation.group.description = input.description ?? undefined;
  if (input.avatarUrl !== undefined) conversation.group.avatarUrl = input.avatarUrl ?? undefined;
  await conversation.save();
  response.json({ conversation: await serializeForUser(await populateConversation(conversation), userId) });
};

export const addGroupMembers: RequestHandler = async (request, response) => {
  const userId = currentUserId(request);
  const { memberIds } = updateMembersSchema.parse(request.body);
  const conversation = await getMemberConversation(String(request.params.conversationId), userId);
  assertGroupOwner(conversation, userId);
  const additions = uniqueObjectIdStrings(memberIds);
  additions.forEach((id) => requireObjectId(id, 'member id'));
  if (await User.countDocuments({ _id: { $in: additions } }) !== additions.length) throw new ApiError(404, 'One or more group members do not exist.', 'USER_NOT_FOUND');
  const members = uniqueObjectIdStrings([...conversation.members.map(String), ...additions]);
  if (members.length > 100) throw new ApiError(400, 'Groups can have at most 100 members.', 'GROUP_MEMBER_LIMIT');
  conversation.members = members.map((id) => requireObjectId(id, 'member id'));
  await conversation.save();
  response.json({ conversation: await serializeForUser(await populateConversation(conversation), userId) });
};

export const listMessages: RequestHandler = async (request, response) => {
  const userId = currentUserId(request);
  const conversation = await getMemberConversation(String(request.params.conversationId), userId);
  const rawCursor = typeof request.query.cursor === 'string' ? request.query.cursor : undefined;
  const cursor = rawCursor ? new Date(rawCursor) : undefined;
  if (cursor && Number.isNaN(cursor.valueOf())) throw new ApiError(400, 'Invalid message cursor.', 'INVALID_CURSOR');
  const records = await Message.find({ conversation: conversation._id, ...(cursor ? { createdAt: { $lt: cursor } } : {}) }).sort({ createdAt: -1 }).limit(50).populate('sender', 'displayName email avatarUrl lastSeen createdAt');
  const nextCursor = records.length === 50 ? records[records.length - 1]?.createdAt.toISOString() : undefined;
  response.json({ messages: records.reverse().map(serializeMessage), nextCursor });
};
