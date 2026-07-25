import type { VercelResponse } from '@vercel/node';
import { ApiError } from '../_lib/errors.js';
import { handleServerless, type AuthenticatedVercelRequest } from '../_lib/handler.js';
import { canonicalDirectKey, requireObjectId } from '../_lib/id.js';
import { Conversation } from '../_lib/models/Conversation.js';
import { Message } from '../_lib/models/Message.js';
import { User } from '../_lib/models/User.js';
import { populateConversation } from '../_lib/services/conversation.service.js';
import { serializeConversation } from '../_lib/serializers.js';
import { broadcastToUserRooms } from '../_lib/supabase.js';
import { createDirectConversationSchema } from '../_lib/validators/conversation.js';

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
  const { participantId } = createDirectConversationSchema.parse(req.body);
  requireObjectId(participantId, 'participant id');

  if (participantId === userId) {
    throw new ApiError(400, 'You cannot start a direct conversation with yourself.', 'INVALID_PARTICIPANT');
  }
  if (!await User.exists({ _id: participantId })) {
    throw new ApiError(404, 'Participant not found.', 'USER_NOT_FOUND');
  }

  const directKey = canonicalDirectKey(userId, participantId);
  let conversation = await Conversation.findOne({ directKey });
  if (!conversation) {
    try {
      conversation = await Conversation.create({ kind: 'direct', members: [userId, participantId], directKey });
    } catch (error) {
      if ((error as { code?: number }).code !== 11000) throw error;
      conversation = await Conversation.findOne({ directKey });
    }
  }

  if (!conversation) {
    throw new ApiError(500, 'Could not create the conversation.', 'CONVERSATION_CREATE_FAILED');
  }

  const populated = await populateConversation(conversation);
  const serialized = await serializeForUser(populated, userId);

  await broadcastToUserRooms([userId, participantId], 'conversation:update', { conversation: serialized });

  res.status(201).json({ conversation: serialized });
}, { requireAuth: true });
