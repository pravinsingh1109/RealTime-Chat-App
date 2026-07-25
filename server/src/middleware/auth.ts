import type { RequestHandler } from 'express';

import { ApiError } from '../errors/ApiError.js';
import { verifyAccessToken } from '../utils/token.js';

export const requireAuth: RequestHandler = (request, _response, next) => {
  const authorization = request.get('authorization');
  const token = authorization?.startsWith('Bearer ') ? authorization.slice(7).trim() : undefined;

  if (!token) {
    next(new ApiError(401, 'Authentication is required.', 'AUTH_REQUIRED'));
    return;
  }

  try {
    request.auth = verifyAccessToken(token);
    next();
  } catch (error) {
    next(error);
  }
};

export function currentUserId(request: Express.Request): string {
  if (!request.auth) {
    throw new ApiError(401, 'Authentication is required.', 'AUTH_REQUIRED');
  }

  return request.auth.userId;
}
