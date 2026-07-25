import type { VercelResponse } from '@vercel/node';
import { ApiError } from '../_lib/errors.js';
import { handleServerless, type AuthenticatedVercelRequest } from '../_lib/handler.js';
import { requireObjectId } from '../_lib/id.js';
import { User } from '../_lib/models/User.js';
import { serializeUser } from '../_lib/serializers.js';

export default handleServerless(async (req: AuthenticatedVercelRequest, res: VercelResponse) => {
  if (req.method !== 'GET') {
    res.status(405).json({ error: { code: 'METHOD_NOT_ALLOWED', message: 'Method not allowed' } });
    return;
  }

  const targetIdStr = Array.isArray(req.query.userId) ? req.query.userId[0] : req.query.userId;
  const userId = requireObjectId(String(targetIdStr), 'user id');
  const user = await User.findById(userId).select('displayName email avatarUrl lastSeen createdAt').lean();
  if (!user) {
    throw new ApiError(404, 'User not found.', 'USER_NOT_FOUND');
  }

  res.status(200).json({ user: serializeUser(user) });
}, { requireAuth: true });
