import { Router } from 'express';
import { getUser, listUsers } from '../controllers/users.controller.js';
import { requireAuth } from '../middleware/auth.js';
import { asyncHandler } from '../utils/asyncHandler.js';

export const usersRouter = Router();
usersRouter.use(requireAuth);
usersRouter.get('/', asyncHandler(listUsers));
usersRouter.get('/:userId', asyncHandler(getUser));
