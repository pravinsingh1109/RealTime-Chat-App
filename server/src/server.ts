import http from 'node:http';
import { createApp } from './app.js';
import { connectDatabase, disconnectDatabase } from './config/database.js';
import { env } from './config/env.js';
import { setupSocket } from './socket/index.js';

async function start(): Promise<void> {
  await connectDatabase();
  const app = createApp();
  const server = http.createServer(app);
  app.set('io', setupSocket(server));
  server.listen(env.PORT, () => console.info(`API and Socket.io listening on port ${env.PORT}`));
  const shutdown = () => server.close(() => { void disconnectDatabase().finally(() => process.exit(0)); });
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
}
start().catch((error) => { console.error('Failed to start server.', error); process.exit(1); });
