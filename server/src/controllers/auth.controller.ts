import bcrypt from 'bcryptjs';
import type { RequestHandler } from 'express';

import { ApiError } from '../errors/ApiError.js';
import { User } from '../models/User.js';
import { currentUserId } from '../middleware/auth.js';
import { serializeUser } from '../utils/serializers.js';
import { signAccessToken } from '../utils/token.js';
import { loginSchema, registerSchema } from '../validators/auth.js';

export const register: RequestHandler = async (request, response) => {
  const input = registerSchema.parse(request.body);
  const existingUser = await User.exists({ email: input.email });
  if (existingUser) {
    throw new ApiError(409, 'An account with this email already exists.', 'EMAIL_IN_USE');
  }

  const passwordHash = await bcrypt.hash(input.password, 12);
  const user = await User.create({
    displayName: input.displayName,
    email: input.email,
    passwordHash
  });

  response.status(201).json({
    token: signAccessToken(user.id),
    user: serializeUser(user)
  });
};

export const login: RequestHandler = async (request, response) => {
  const input = loginSchema.parse(request.body);
  const user = await User.findOne({ email: input.email }).select('+passwordHash');
  const passwordMatches = user ? await user.comparePassword(input.password) : false;

  if (!user || !passwordMatches) {
    throw new ApiError(401, 'Email or password is incorrect.', 'INVALID_CREDENTIALS');
  }

  user.lastSeen = new Date();
  await user.save();

  response.json({
    token: signAccessToken(user.id),
    user: serializeUser(user)
  });
};

export const getCurrentUser: RequestHandler = async (request, response) => {
  const user = await User.findById(currentUserId(request));
  if (!user) {
    throw new ApiError(401, 'The authenticated account no longer exists.', 'ACCOUNT_NOT_FOUND');
  }

  response.json({ user: serializeUser(user) });
};
