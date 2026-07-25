import jwt, { type JwtPayload, type SignOptions } from 'jsonwebtoken';

import { env } from '../config/env.js';
import { ApiError } from '../errors/ApiError.js';

export interface AuthenticatedUser {
  userId: string;
}

export function signAccessToken(userId: string): string {
  return jwt.sign({}, env.JWT_SECRET, {
    subject: userId,
    expiresIn: env.JWT_EXPIRES_IN as SignOptions['expiresIn']
  });
}

export function verifyAccessToken(token: string): AuthenticatedUser {
  try {
    const decoded = jwt.verify(token, env.JWT_SECRET) as JwtPayload;

    if (!decoded.sub || typeof decoded.sub !== 'string') {
      throw new ApiError(401, 'Invalid authentication token.', 'INVALID_TOKEN');
    }

    return { userId: decoded.sub };
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }

    throw new ApiError(401, 'Your authentication token is invalid or expired.', 'INVALID_TOKEN');
  }
}
