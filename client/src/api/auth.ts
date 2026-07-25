import { clearAccessToken, request, setAccessToken } from './http';
import type { AuthSession, User } from '../types/chat';

interface RawUser {
  id?: string;
  _id?: string;
  name?: string;
  displayName?: string;
  username?: string;
  email?: string;
  avatarUrl?: string;
  avatar?: string;
  about?: string;
  isOnline?: boolean;
  lastSeenAt?: string;
  lastSeen?: string;
}

export function normalizeUser(raw: RawUser | undefined | null): User {
  return {
    id: String(raw?.id ?? raw?._id ?? ''),
    name: raw?.displayName || raw?.name || raw?.username || raw?.email?.split('@')[0] || 'Unknown user',
    email: raw?.email,
    avatarUrl: raw?.avatarUrl ?? raw?.avatar,
    about: raw?.about,
    isOnline: raw?.isOnline,
    lastSeenAt: raw?.lastSeenAt ?? raw?.lastSeen,
  };
}

function normalizeSession(raw: Record<string, unknown>): AuthSession {
  const token = String(raw.token ?? raw.accessToken ?? '');
  const user = normalizeUser((raw.user ?? raw.data) as RawUser | undefined);
  if (!token || !user.id) throw new Error('The server returned an invalid authentication response.');
  setAccessToken(token);
  return { token, user };
}

export const authApi = {
  async login(credentials: { email: string; password: string }): Promise<AuthSession> {
    const raw = await request<Record<string, unknown>>('/auth/login', {
      method: 'POST',
      body: credentials,
      authenticated: false,
    });
    return normalizeSession(raw);
  },

  async register(details: { name: string; email: string; password: string }): Promise<AuthSession> {
    const raw = await request<Record<string, unknown>>('/auth/register', {
      method: 'POST',
      body: { displayName: details.name, email: details.email, password: details.password },
      authenticated: false,
    });
    return normalizeSession(raw);
  },

  async me(): Promise<User> {
    const raw = await request<Record<string, unknown>>('/auth/me');
    return normalizeUser((raw.user ?? raw.data ?? raw) as RawUser);
  },

  logout(): void {
    clearAccessToken();
  },
};
