import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getDatabaseStatus } from './_lib/database.js';
import { env } from './_lib/env.js';
import { handleServerless } from './_lib/handler.js';

export default handleServerless(async (_req: VercelRequest, res: VercelResponse) => {
  const databaseStatus = getDatabaseStatus();
  res.status(200).json({
    status: databaseStatus.connected ? 'ok' : 'degraded',
    environment: env.NODE_ENV,
    database: databaseStatus,
  });
});
