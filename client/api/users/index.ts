import type { VercelResponse } from '@vercel/node';
import { handleServerless, type AuthenticatedVercelRequest } from '../_lib/handler.js';
import { User } from '../_lib/models/User.js';
import { serializeUser } from '../_lib/serializers.js';
import { escapeRegex } from '../_lib/strings.js';

export default handleServerless(async (req: AuthenticatedVercelRequest, res: VercelResponse) => {
  if (req.method !== 'GET') {
    res.status(405).json({ error: { code: 'METHOD_NOT_ALLOWED', message: 'Method not allowed' } });
    return;
  }

  const currentUser = req.userId;
  const rawSearch = typeof req.query.search === 'string' ? req.query.search.trim().slice(0, 50) : '';
  const rawLimit = typeof req.query.limit === 'string' ? Number.parseInt(req.query.limit, 10) : 20;
  const limit = Number.isFinite(rawLimit) ? Math.max(1, Math.min(rawLimit, 50)) : 20;
  const search = escapeRegex(rawSearch);
  const filter: Record<string, unknown> = { _id: { $ne: currentUser } };

  if (search) {
    filter.$or = [
      { displayName: { $regex: search, $options: 'i' } },
      { email: { $regex: search, $options: 'i' } },
    ];
  }

  const users = await User.find(filter)
    .select('displayName email avatarUrl lastSeen createdAt')
    .sort({ displayName: 1 })
    .limit(limit)
    .lean();

  res.status(200).json({ users: users.map(serializeUser) });
}, { requireAuth: true });
