import 'dotenv/config';

import { z } from 'zod';

const isProduction = process.env.NODE_ENV === 'production';
const developmentSecret = 'development-secret-change-before-deployment-2026';

if (isProduction && !process.env.JWT_SECRET) {
  throw new Error('JWT_SECRET is required when NODE_ENV=production.');
}

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  MONGODB_URI: z.string().min(1).default('mongodb://127.0.0.1:27017/realtime-chat'),
  JWT_SECRET: z.string().min(32).default(developmentSecret),
  JWT_EXPIRES_IN: z.string().min(1).default('7d'),
  CORS_ORIGIN: z.string().min(1).default('http://localhost:5173'),
  UPLOAD_DIR: z.string().min(1).default('uploads'),
  MAX_FILE_SIZE_MB: z.coerce.number().positive().max(20).default(5)
});

export const env = schema.parse({
  NODE_ENV: process.env.NODE_ENV,
  PORT: process.env.PORT,
  MONGODB_URI: process.env.MONGODB_URI,
  JWT_SECRET: process.env.JWT_SECRET,
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN,
  CORS_ORIGIN: process.env.CORS_ORIGIN,
  UPLOAD_DIR: process.env.UPLOAD_DIR,
  MAX_FILE_SIZE_MB: process.env.MAX_FILE_SIZE_MB
});

export const corsOrigins = env.CORS_ORIGIN.split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);
