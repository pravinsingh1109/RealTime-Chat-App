import type { VercelRequest, VercelResponse } from '@vercel/node';
import { connectDatabase } from './database.js';
import { ApiError } from './errors.js';
import { extractToken, verifyAccessToken } from './jwt.js';

export interface AuthenticatedVercelRequest extends VercelRequest {
  userId: string;
}

export type VercelHandler = (
  req: VercelRequest,
  res: VercelResponse
) => Promise<unknown> | unknown;

export type AuthenticatedVercelHandler = (
  req: AuthenticatedVercelRequest,
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

export function handleServerless(handler: AuthenticatedVercelHandler, options: { requireAuth: true }): (req: VercelRequest, res: VercelResponse) => Promise<void>;
export function handleServerless(handler: VercelHandler, options?: { requireAuth?: false }): (req: VercelRequest, res: VercelResponse) => Promise<void>;
export function handleServerless(handler: (req: AuthenticatedVercelRequest, res: VercelResponse) => Promise<unknown> | unknown, options: { requireAuth?: boolean } = {}) {
  return async (req: VercelRequest, res: VercelResponse) => {
    allowCors(res);

    if (req.method === 'OPTIONS') {
      res.status(200).end();
      return;
    }

    try {
      if (req.body && typeof req.body === 'string') {
        try {
          req.body = JSON.parse(req.body);
        } catch {
          // keep as string
        }
      }

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

      if (error && typeof error === 'object' && ('name' in error || 'issues' in error)) {
        const errObj = error as Record<string, unknown>;
        const name = String(errObj.name ?? '');
        const issues = Array.isArray(errObj.issues) ? (errObj.issues as Array<{ message?: string; path?: string[] }>) : undefined;

        if (name === 'ZodError' || issues) {
          const firstMessage = issues?.[0]?.message || 'Validation failed.';
          const fieldErrors: Record<string, string[]> = {};
          if (issues) {
            for (const issue of issues) {
              const path = issue.path?.join('.') || 'form';
              if (!fieldErrors[path]) fieldErrors[path] = [];
              if (issue.message) fieldErrors[path].push(issue.message);
            }
          }
          res.status(400).json({
            error: {
              code: 'VALIDATION_ERROR',
              message: firstMessage,
              details: { fieldErrors, issues },
            },
          });
          return;
        }
      }

      console.error('Unhandled serverless function error:', error);
      const errMsg = error instanceof Error ? error.message : 'An unexpected error occurred.';
      res.status(500).json({
        error: {
          code: 'INTERNAL_ERROR',
          message: errMsg.includes('MONGODB_URI') || errMsg.includes('Mongo')
            ? 'Database connection failed. Please check MONGODB_URI environment variable.'
            : errMsg,
        },
      });
    }
  };
}
