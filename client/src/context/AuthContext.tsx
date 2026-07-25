import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { authApi } from '../api/auth';
import { clearAccessToken, getAccessToken } from '../api/http';
import type { AuthSession, User } from '../types/chat';

interface AuthContextValue {
  session: AuthSession | null;
  isBootstrapping: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (name: string, email: string, password: string) => Promise<void>;
  logout: () => void;
}

const SESSION_KEY = 'pulse.user';
const AuthContext = createContext<AuthContextValue | undefined>(undefined);

function cachedUser(): User | null {
  try {
    const raw = window.localStorage.getItem(SESSION_KEY);
    return raw ? JSON.parse(raw) as User : null;
  } catch {
    return null;
  }
}

function persistUser(user: User): void {
  window.localStorage.setItem(SESSION_KEY, JSON.stringify(user));
}

export function AuthProvider({ children }: { children: React.ReactNode }): React.JSX.Element {
  const initialToken = getAccessToken();
  const [session, setSession] = useState<AuthSession | null>(() => {
    const user = cachedUser();
    return initialToken && user ? { token: initialToken, user } : null;
  });
  const [isBootstrapping, setIsBootstrapping] = useState(Boolean(initialToken));

  useEffect(() => {
    if (!initialToken) return;
    let alive = true;
    void authApi.me()
      .then((user) => {
        if (!alive) return;
        persistUser(user);
        setSession({ token: initialToken, user });
      })
      .catch((err) => {
        if (!alive) return;
        const status = (err as Record<string, unknown>)?.status;
        if (status === 401) {
          clearAccessToken();
          window.localStorage.removeItem(SESSION_KEY);
          setSession(null);
        }
      })
      .finally(() => {
        if (alive) setIsBootstrapping(false);
      });
    return () => { alive = false; };
  }, [initialToken]);

  const complete = useCallback((nextSession: AuthSession) => {
    persistUser(nextSession.user);
    setSession(nextSession);
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    complete(await authApi.login({ email, password }));
  }, [complete]);

  const register = useCallback(async (name: string, email: string, password: string) => {
    complete(await authApi.register({ name, email, password }));
  }, [complete]);

  const logout = useCallback(() => {
    authApi.logout();
    window.localStorage.removeItem(SESSION_KEY);
    setSession(null);
  }, []);

  const value = useMemo(() => ({ session, isBootstrapping, login, register, logout }), [session, isBootstrapping, login, register, logout]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider.');
  return context;
}
