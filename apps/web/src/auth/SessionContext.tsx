import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { api, setAccessToken } from '../lib/api';
import type { Capability, SessionResponse } from '../lib/types';

interface SessionState {
  session: SessionResponse | null;
  loading: boolean;
  /**
   * Mirrors the server's capability table for rendering decisions only; the
   * API enforces the same rules and redacts data it will not release.
   */
  can(capability: Capability): boolean;
  signIn(email: string, password: string): Promise<void>;
  signUp(input: {
    organizationName: string;
    slug: string;
    name: string;
    email: string;
    password: string;
  }): Promise<void>;
  signOut(): Promise<void>;
  refresh(): Promise<void>;
}

const SessionContext = createContext<SessionState | null>(null);

export function SessionProvider({ children }: { children: ReactNode }): JSX.Element {
  const [session, setSession] = useState<SessionResponse | null>(null);
  const [loading, setLoading] = useState(true);

  const adopt = useCallback((next: SessionResponse) => {
    setAccessToken(next.accessToken);
    setSession(next);
  }, []);

  // On load, trade the httpOnly refresh cookie for an access token so a page
  // reload does not force the director to sign in again.
  useEffect(() => {
    let cancelled = false;
    api<SessionResponse>('/auth/refresh', { method: 'POST' })
      .then((next) => {
        if (!cancelled) adopt(next);
      })
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [adopt]);

  const value = useMemo<SessionState>(
    () => ({
      session,
      loading,
      can(capability) {
        return session?.user.capabilities.includes(capability) ?? false;
      },
      async signIn(email, password) {
        adopt(await api<SessionResponse>('/auth/login', { method: 'POST', body: { email, password } }));
      },
      async signUp(input) {
        adopt(await api<SessionResponse>('/auth/signup', { method: 'POST', body: input }));
      },
      async signOut() {
        await api('/auth/logout', { method: 'POST' }).catch(() => undefined);
        setAccessToken(null);
        setSession(null);
      },
      async refresh() {
        adopt(await api<SessionResponse>('/auth/me'));
      },
    }),
    [session, loading, adopt],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionState {
  const context = useContext(SessionContext);
  if (!context) throw new Error('useSession must be used inside SessionProvider');
  return context;
}
