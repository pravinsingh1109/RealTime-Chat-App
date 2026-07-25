import type { VercelRequest, VercelResponse } from '@vercel/node';
import { connectDatabase } from './database.js';
import { ApiError } from './errors.js';
import { extractToken, verifyAccessToken } from './jwt.js';

export interface AuthenticatedVercelRequest extends VercelRequest {
  userId: string;
}

export type AnyVercelHandler = (
  req: any,
  res: VercelResponse
) => Promise<unknown> | unknown;

export function allowCors(res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization'
  );
}

export function handleServerless(handler: AnyVercelHandler, options: { requireAuth?: boolean } = {}) {
  return async (req: VercelRequest, res: VercelResponse) => {
    allowCors(res);

    if (req.method === 'OPTIONS') {
      res.status(200).end();
      return;
    }

    try {
      await connectDatabase();

      if (options.requireAuth) {
        const token = extractToken(req.headers.authorization);
        if (!token) {
          throw new ApiError(401, 'Authentication token missing.', 'UNAUTHORIZED');
        }
        const { userId } = verifyAccessToken(token);
        (req as AuthenticatedVercelRequest).userId = userId;
      }

      await handler(req as AuthenticatedVercelRequest, res);
    } catch (error) {
      if (error instanceof ApiError) {
        res.status(error.statusCode).json({
          error: {
            code: error.code,
            message: error.message,
          },
        });
        return;
      }

      if (error && typeof error === 'object' && 'name' in error && error.name === 'ZodError') {
        const zodErr = error as any;
        res.status(400).json({
          error: {
            code: 'VALIDATION_ERROR',
            message: zodErr.issues?.[0]?.message || 'Validation failed.',
            details: zodErr.issues,
          },
        });
        return;
      }

      console.error('Unhandled serverless function error:', error);
      res.status(500).json({
        error: {
          code: 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : 'An unexpected error occurred.',
        },
      });
    }
  };
}
