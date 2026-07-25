import type { VercelResponse } from '@vercel/node';
import { ApiError } from '../_lib/errors.js';
import { handleServerless, type AuthenticatedVercelRequest } from '../_lib/handler.js';
import { User } from '../_lib/models/User.js';
import { serializeUser } from '../_lib/serializers.js';

export default handleServerless(async (req: AuthenticatedVercelRequest, res: VercelResponse) => {
  if (req.method !== 'GET') {
    res.status(405).json({ error: { code: 'METHOD_NOT_ALLOWED', message: 'Method not allowed' } });
    return;
  }

  const user = await User.findById(req.userId);
  if (!user) {
    throw new ApiError(401, 'The authenticated account no longer exists.', 'ACCOUNT_NOT_FOUND');
  }

  res.status(200).json({ user: serializeUser(user) });
}, { requireAuth: true });
