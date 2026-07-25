import mongoose from 'mongoose';
import { env } from './env.js';
import { enableInMemoryDb, isInMemoryDbActive } from './inMemoryStore.js';

interface MongooseCache {
  conn: typeof mongoose | null;
  promise: Promise<typeof mongoose> | null;
}

declare global {
  var mongooseCache: MongooseCache | undefined;
}

const cached: MongooseCache = globalThis.mongooseCache ?? { conn: null, promise: null };
if (!globalThis.mongooseCache) {
  globalThis.mongooseCache = cached;
}

export async function connectDatabase(): Promise<typeof mongoose> {
  if (isInMemoryDbActive()) {
    return mongoose;
  }

  if (cached.conn && mongoose.connection.readyState === 1) {
    return cached.conn;
  }

  if (!cached.promise) {
    const uri = env.MONGODB_URI;
    cached.promise = mongoose.connect(uri, {
      bufferCommands: false,
      serverSelectionTimeoutMS: 1200,
      connectTimeoutMS: 1200,
    }).then((m) => m);
  }

  try {
    cached.conn = await cached.promise;
  } catch (error) {
    cached.promise = null;
    console.warn('[Database] Local MongoDB unreachable. Operating in high-speed In-Memory Mode.');
    enableInMemoryDb();
    return mongoose;
  }

  return cached.conn;
}

export function getDatabaseStatus() {
  const readyState = mongoose.connection.readyState;
  const inMemory = isInMemoryDbActive();
  return {
    connected: readyState === 1 || inMemory,
    readyState: inMemory ? 1 : readyState,
    inMemory,
  };
}

