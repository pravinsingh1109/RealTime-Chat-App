import type { VercelResponse } from '@vercel/node';
import { handleServerless, type AuthenticatedVercelRequest } from '../_lib/handler.js';
import { Conversation } from '../_lib/models/Conversation.js';
import { Message } from '../_lib/models/Message.js';
import { populateConversation } from '../_lib/services/conversation.service.js';
import { serializeConversation } from '../_lib/serializers.js';

async function serializeForUser(conversation: Awaited<ReturnType<typeof populateConversation>>, userId: string) {
  const unreadCount = await Message.countDocuments({
    conversation: conversation._id,
    sender: { $ne: userId },
    'readBy.user': { $ne: userId },
  });
  return { ...serializeConversation(conversation), unreadCount };
}

export default handleServerless(async (req: AuthenticatedVercelRequest, res: VercelResponse) => {
  if (req.method !== 'GET') {
    res.status(405).json({ error: { code: 'METHOD_NOT_ALLOWED', message: 'Method not allowed' } });
    return;
  }

  const userId = req.userId;
  const records = await Conversation.find({ members: userId }).sort({ updatedAt: -1 });
  const populated = await Promise.all(records.map(populateConversation));
  const result = await Promise.all(populated.map((conversation) => serializeForUser(conversation, userId)));

  res.status(200).json({ conversations: result });
}, { requireAuth: true });
