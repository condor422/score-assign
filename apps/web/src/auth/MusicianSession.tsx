import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';

const STORAGE_KEY = 'sa_musician_token';

interface MusicianSessionState {
  token: string | null;
  adopt(token: string): void;
  signOut(): void;
}

const MusicianSessionContext = createContext<MusicianSessionState | null>(null);

/**
 * Holds the musician's short-lived token in sessionStorage so moving between
 * the portal's pages does not require another emailed link. It is dropped when
 * the tab closes, and it is never the long-lived credential a password would be.
 */
export function MusicianSessionProvider({ children }: { children: ReactNode }): JSX.Element {
  const [token, setToken] = useState<string | null>(() => {
    try {
      return window.sessionStorage.getItem(STORAGE_KEY);
    } catch {
      return null;
    }
  });

  const adopt = useCallback((next: string) => {
    try {
      window.sessionStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Private-mode browsers may refuse storage; the token still works in memory.
    }
    setToken(next);
  }, []);

  const signOut = useCallback(() => {
    try {
      window.sessionStorage.removeItem(STORAGE_KEY);
    } catch {
      // Nothing to clear.
    }
    setToken(null);
  }, []);

  const value = useMemo<MusicianSessionState>(
    () => ({ token, adopt, signOut }),
    [token, adopt, signOut],
  );

  return (
    <MusicianSessionContext.Provider value={value}>{children}</MusicianSessionContext.Provider>
  );
}

export function useMusicianSession(): MusicianSessionState {
  const context = useContext(MusicianSessionContext);
  if (!context) throw new Error('useMusicianSession must be used inside MusicianSessionProvider');
  return context;
}
