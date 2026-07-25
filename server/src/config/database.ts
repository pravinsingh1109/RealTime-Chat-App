import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

import { env } from './env.js';

let connectionError: Error | null = null;
let connected = false;
let memServer: MongoMemoryServer | null = null;

export async function connectDatabase(): Promise<boolean> {
  mongoose.set('strictQuery', true);

  if (mongoose.connection.readyState === 1) {
    connected = true;
    connectionError = null;
    return true;
  }

  try {
    await mongoose.connect(env.MONGODB_URI, {
      serverSelectionTimeoutMS: 10_000
    });
    connected = true;
    connectionError = null;
    return true;
  } catch (error) {
    // Attempt in-memory fallback for development
    if (env.NODE_ENV === 'development') {
      try {
        memServer = await MongoMemoryServer.create();
        const uri = memServer.getUri();
        await mongoose.connect(uri, { serverSelectionTimeoutMS: 10_000 });
        connected = true;
        connectionError = null;
        console.warn('Connected to in-memory MongoDB for development.');
        return true;
      } catch (memErr) {
        connected = false;
        connectionError = memErr instanceof Error ? memErr : new Error(String(memErr));
        console.warn(`MongoDB unavailable and in-memory fallback failed: ${connectionError.message}`);
        return false;
      }
    }

    connected = false;
    connectionError = error instanceof Error ? error : new Error(String(error));
    console.warn(`MongoDB unavailable; continuing without database connectivity: ${connectionError.message}`);
    return false;
  }
}

export function getDatabaseStatus() {
  return {
    connected,
    readyState: mongoose.connection.readyState,
    error: connectionError?.message ?? null
  };
}

export async function disconnectDatabase(): Promise<void> {
  if (mongoose.connection.readyState === 0 || mongoose.connection.readyState === 3) {
    connected = false;
    connectionError = null;
    if (memServer) {
      await memServer.stop();
      memServer = null;
    }
    return;
  }

  await mongoose.disconnect();
  connected = false;
  connectionError = null;
  if (memServer) {
    await memServer.stop();
    memServer = null;
  }
}
