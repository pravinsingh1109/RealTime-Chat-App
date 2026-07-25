import type { VercelRequest, VercelResponse } from '@vercel/node';
import bcrypt from 'bcryptjs';
import { ApiError } from '../_lib/errors.js';
import { handleServerless } from '../_lib/handler.js';
import { signAccessToken } from '../_lib/jwt.js';
import { User } from '../_lib/models/User.js';
import { serializeUser } from '../_lib/serializers.js';
import { registerSchema } from '../_lib/validators/auth.js';

export default handleServerless(async (req: VercelRequest, res: VercelResponse) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: { code: 'METHOD_NOT_ALLOWED', message: 'Method not allowed' } });
    return;
  }

  const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
  const input = registerSchema.parse(body);
  const existingUser = await User.exists({ email: input.email });
  if (existingUser) {
    throw new ApiError(409, 'An account with this email already exists.', 'EMAIL_IN_USE');
  }

  const passwordHash = await bcrypt.hash(input.password, 12);
  const user = await User.create({
    displayName: input.displayName,
    email: input.email,
    passwordHash,
  });

  res.status(201).json({
    token: signAccessToken(user.id),
    user: serializeUser(user),
  });
});
