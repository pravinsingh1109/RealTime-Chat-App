import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  MONGODB_URI: z.string().trim().min(1, 'MONGODB_URI is required'),
  JWT_SECRET: z.string().trim().min(16, 'JWT_SECRET must be at least 16 characters long'),
  JWT_EXPIRES_IN: z.string().trim().default('7d'),
  SUPABASE_URL: z.string().trim().optional().default(''),
  SUPABASE_ANON_KEY: z.string().trim().optional().default(''),
  SUPABASE_SERVICE_ROLE_KEY: z.string().trim().optional().default(''),
});

export function getEnv() {
  return envSchema.parse({
    NODE_ENV: process.env.NODE_ENV,
    MONGODB_URI: process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/realtime-chat',
    JWT_SECRET: process.env.JWT_SECRET || 'dev-secret-key-at-least-32-characters-long',
    JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || '7d',
    SUPABASE_URL: process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '',
    SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || '',
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY || '',
  });
}

export const env = getEnv();
