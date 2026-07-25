import cors from 'cors';
import express from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import { getDatabaseStatus } from './config/database.js';
import { corsOrigins, env } from './config/env.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import { uploadDirectory } from './middleware/upload.js';
import { authRouter } from './routes/auth.routes.js';
import { conversationsRouter } from './routes/conversations.routes.js';
import { uploadsRouter } from './routes/uploads.routes.js';
import { usersRouter } from './routes/users.routes.js';

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
  app.use(cors({ origin: corsOrigins, credentials: false }));
  app.use(express.json({ limit: '1mb' }));
  app.use(rateLimit({ windowMs: 15 * 60 * 1000, limit: 1000, standardHeaders: 'draft-7', legacyHeaders: false }));
  app.get('/health', (_request, response) => {
    const databaseStatus = getDatabaseStatus();
    response.json({
      status: databaseStatus.connected ? 'ok' : 'degraded',
      environment: env.NODE_ENV,
      database: databaseStatus
    });
  });
  app.use('/uploads', express.static(uploadDirectory, { maxAge: '7d', index: false, fallthrough: false }));
  app.use('/api/auth', authRouter);
  app.use('/api/users', usersRouter);
  app.use('/api/conversations', conversationsRouter);
  app.use('/api/uploads', uploadsRouter);
  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
