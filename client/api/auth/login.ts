import type { VercelRequest, VercelResponse } from '@vercel/node';
import { ApiError } from '../_lib/errors.js';
import { handleServerless } from '../_lib/handler.js';
import { signAccessToken } from '../_lib/jwt.js';
import { User } from '../_lib/models/User.js';
import { serializeUser } from '../_lib/serializers.js';
import { loginSchema } from '../_lib/validators/auth.js';

export default handleServerless(async (req: VercelRequest, res: VercelResponse) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: { code: 'METHOD_NOT_ALLOWED', message: 'Method not allowed' } });
    return;
  }

  const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
  const input = loginSchema.parse(body);
  const user = await User.findOne({ email: input.email }).select('+passwordHash');
  const passwordMatches = user ? await user.comparePassword(input.password) : false;

  if (!user || !passwordMatches) {
    throw new ApiError(401, 'Email or password is incorrect.', 'INVALID_CREDENTIALS');
  }

  user.lastSeen = new Date();
  await user.save();

  res.status(200).json({
    token: signAccessToken(user.id),
    user: serializeUser(user),
  });
});
