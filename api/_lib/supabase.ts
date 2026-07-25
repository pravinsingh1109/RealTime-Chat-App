import { createClient } from '@supabase/supabase-js';
import { env } from './env.js';

export function getSupabaseServerClient() {
  const url = env.SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

export async function broadcastToUserRooms(userIds: string[], event: string, payload: unknown) {
  const supabase = getSupabaseServerClient();
  if (!supabase) return;
  const uniqueIds = [...new Set(userIds)];
  await Promise.all(
    uniqueIds.map(async (userId) => {
      try {
        const channel = supabase.channel(`user:${userId}`);
        await channel.send({
          type: 'broadcast',
          event,
          payload,
        });
      } catch (err) {
        console.error(`Failed to broadcast ${event} to user:${userId}`, err);
      }
    })
  );
}
