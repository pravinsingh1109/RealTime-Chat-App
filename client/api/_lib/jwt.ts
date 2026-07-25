import jwt from 'jsonwebtoken';
import { env } from './env.js';

export interface AuthenticatedUser {
  userId: string;
}

export function signAccessToken(userId: string): string {
  return jwt.sign({ sub: userId }, env.JWT_SECRET, {
    expiresIn: env.JWT_EXPIRES_IN as jwt.SignOptions['expiresIn'],
  });
}

export function verifyAccessToken(token: string): AuthenticatedUser {
  if (!token) {
    throw new Error('Access token missing');
  }
  try {
    const decoded = jwt.verify(token, env.JWT_SECRET) as jwt.JwtPayload;
    const userId = typeof decoded.sub === 'string' ? decoded.sub : '';
    if (!userId) {
      throw new Error('Invalid token subject');
    }
    return { userId };
  } catch {
    throw new Error('Invalid or expired token');
  }
}

export function extractToken(authHeader?: string): string {
  if (!authHeader) return '';
  const parts = authHeader.split(' ');
  if (parts.length === 2 && parts[0].toLowerCase() === 'bearer') {
    return parts[1];
  }
  return '';
}
