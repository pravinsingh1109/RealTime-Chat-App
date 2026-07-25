import type { RequestHandler } from 'express';

import { ApiError } from '../errors/ApiError.js';
import { currentUserId } from '../middleware/auth.js';
import { User } from '../models/User.js';
import { requireObjectId } from '../utils/id.js';
import { serializeUser } from '../utils/serializers.js';
import { escapeRegex } from '../utils/strings.js';

export const listUsers: RequestHandler = async (request, response) => {
  const currentUser = currentUserId(request);
  const rawSearch = typeof request.query.search === 'string' ? request.query.search.trim().slice(0, 50) : '';
  const rawLimit = typeof request.query.limit === 'string' ? Number.parseInt(request.query.limit, 10) : 20;
  const limit = Number.isFinite(rawLimit) ? Math.max(1, Math.min(rawLimit, 50)) : 20;
  const search = escapeRegex(rawSearch);
  const filter: Record<string, unknown> = { _id: { $ne: currentUser } };

  if (search) {
    filter.$or = [
      { displayName: { $regex: search, $options: 'i' } },
      { email: { $regex: search, $options: 'i' } }
    ];
  }

  const users = await User.find(filter)
    .select('displayName email avatarUrl lastSeen createdAt')
    .sort({ displayName: 1 })
    .limit(limit)
    .lean();

  response.json({ users: users.map(serializeUser) });
};

export const getUser: RequestHandler = async (request, response) => {
  const userId = requireObjectId(String(request.params.userId), 'user id');
  const user = await User.findById(userId).select('displayName email avatarUrl lastSeen createdAt').lean();
  if (!user) {
    throw new ApiError(404, 'User not found.', 'USER_NOT_FOUND');
  }

  response.json({ user: serializeUser(user) });
};
