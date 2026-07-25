import { defineConfig } from 'vite';
import type { Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import fs from 'node:fs';

function apiDevPlugin(): Plugin {
  return {
    name: 'api-dev-server',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (!req.url?.startsWith('/api/')) {
          return next();
        }

        try {
          const host = req.headers.host || 'localhost:5173';
          const urlObj = new URL(req.url, `http://${host}`);
          const pathname = urlObj.pathname.replace(/\/$/, '');

          let relativeHandlerPath: string | null = null;
          const routeParams: Record<string, string> = {};

          if (pathname === '/api/health') relativeHandlerPath = 'api/health.ts';
          else if (pathname === '/api/auth/register') relativeHandlerPath = 'api/auth/register.ts';
          else if (pathname === '/api/auth/login') relativeHandlerPath = 'api/auth/login.ts';
          else if (pathname === '/api/auth/me') relativeHandlerPath = 'api/auth/me.ts';
          else if (pathname === '/api/users') relativeHandlerPath = 'api/users/index.ts';
          else if (pathname === '/api/conversations') relativeHandlerPath = 'api/conversations/index.ts';
          else if (pathname === '/api/conversations/direct') relativeHandlerPath = 'api/conversations/direct.ts';
          else if (pathname === '/api/conversations/group') relativeHandlerPath = 'api/conversations/group.ts';
          else if (pathname === '/api/uploads/image') relativeHandlerPath = 'api/uploads/image.ts';
          else {
            const userMatch = pathname.match(/^\/api\/users\/([^/]+)$/);
            if (userMatch) {
              relativeHandlerPath = 'api/users/[userId].ts';
              routeParams.userId = userMatch[1];
            } else {
              const msgMatch = pathname.match(/^\/api\/conversations\/([^/]+)\/messages$/);
              if (msgMatch) {
                relativeHandlerPath = 'api/conversations/[conversationId]/messages.ts';
                routeParams.conversationId = msgMatch[1];
              } else {
                const readMatch = pathname.match(/^\/api\/conversations\/([^/]+)\/read$/);
                if (readMatch) {
                  relativeHandlerPath = 'api/conversations/[conversationId]/read.ts';
                  routeParams.conversationId = readMatch[1];
                } else {
                  const grpMatch = pathname.match(/^\/api\/conversations\/([^/]+)\/group$/);
                  if (grpMatch) {
                    relativeHandlerPath = 'api/conversations/[conversationId]/group.ts';
                    routeParams.conversationId = grpMatch[1];
                  } else {
                    const memMatch = pathname.match(/^\/api\/conversations\/([^/]+)\/members$/);
                    if (memMatch) {
                      relativeHandlerPath = 'api/conversations/[conversationId]/members.ts';
                      routeParams.conversationId = memMatch[1];
                    }
                  }
                }
              }
            }
          }

          if (!relativeHandlerPath) {
            return next();
          }

          const rootDir = path.resolve(server.config.root, '..');
          let handlerFile = path.resolve(rootDir, relativeHandlerPath);
          if (!fs.existsSync(handlerFile)) {
            handlerFile = path.resolve(server.config.root, relativeHandlerPath);
          }

          if (!fs.existsSync(handlerFile)) {
            return next();
          }

          let bodyData: any = undefined;
          if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method || '')) {
            const chunks: Uint8Array[] = [];
            for await (const chunk of req) {
              chunks.push(chunk);
            }
            const rawBody = Buffer.concat(chunks).toString('utf-8');
            if (rawBody) {
              try {
                bodyData = JSON.parse(rawBody);
              } catch {
                bodyData = rawBody;
              }
            }
          }

          const queryParams: Record<string, string | string[]> = { ...routeParams };
          urlObj.searchParams.forEach((val, key) => {
            queryParams[key] = val;
          });

          const vercelReq = Object.assign(req, {
            query: queryParams,
            body: bodyData,
            cookies: {},
          });

          const vercelRes = Object.assign(res, {
            status(code: number) {
              res.statusCode = code;
              return vercelRes;
            },
            json(data: any) {
              if (!res.headersSent) {
                res.setHeader('Content-Type', 'application/json');
              }
              res.end(JSON.stringify(data));
              return vercelRes;
            },
            send(data: any) {
              if (typeof data === 'object' && data !== null && !Buffer.isBuffer(data)) {
                return vercelRes.json(data);
              }
              res.end(data);
              return vercelRes;
            },
          });

          const mod = await server.ssrLoadModule(handlerFile);
          if (mod && typeof mod.default === 'function') {
            await mod.default(vercelReq, vercelRes);
          } else {
            next();
          }
        } catch (err: any) {
          console.error('Local API Handler Error:', err);
          if (!res.headersSent) {
            res.statusCode = 500;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({
              error: {
                code: 'INTERNAL_ERROR',
                message: err?.message || 'Internal Server Error',
              },
            }));
          }
        }
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), apiDevPlugin()],
  server: {
    port: 5173,
    proxy: process.env.VITE_API_TARGET
      ? {
        '/api': { target: process.env.VITE_API_TARGET, changeOrigin: true },
      }
      : undefined,
  },
});