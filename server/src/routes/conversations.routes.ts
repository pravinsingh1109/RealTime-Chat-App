import { Router } from 'express';
import { addGroupMembers, createDirectConversation, createGroupConversation, listConversations, listMessages, updateGroupConversation } from '../controllers/conversations.controller.js';
import { markMessagesSeen, sendMessage } from '../controllers/messages.controller.js';
import { requireAuth } from '../middleware/auth.js';
import { asyncHandler } from '../utils/asyncHandler.js';

export const conversationsRouter = Router();
conversationsRouter.use(requireAuth);
conversationsRouter.get('/', asyncHandler(listConversations));
conversationsRouter.post('/direct', asyncHandler(createDirectConversation));
conversationsRouter.post('/group', asyncHandler(createGroupConversation));
conversationsRouter.get('/:conversationId/messages', asyncHandler(listMessages));
conversationsRouter.post('/:conversationId/messages', asyncHandler(sendMessage));
conversationsRouter.post('/:conversationId/read', asyncHandler(markMessagesSeen));
conversationsRouter.patch('/:conversationId/group', asyncHandler(updateGroupConversation));
conversationsRouter.post('/:conversationId/members', asyncHandler(addGroupMembers));
