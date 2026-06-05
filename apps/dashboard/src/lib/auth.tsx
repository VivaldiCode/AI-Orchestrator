import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { User } from '@ai-orchestrator/shared';
import { api, clearTokens, getTokens, setTokens } from './api';

type Status = 'loading' | 'needsSetup' | 'unauthenticated' | 'authenticated';

interface AuthContextValue {
  status: Status;
  user: User | null;
  login: (username: string, password: string) => Promise<void>;
  setup: (username: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Status>('loading');
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        // One-time SSO handoff: ?oauth=<code> → exchange for tokens, then scrub the URL.
        const params = new URLSearchParams(window.location.search);
        const oauthCode = params.get('oauth');
        if (oauthCode) {
          params.delete('oauth');
          const qs = params.toString();
          window.history.replaceState(
            {},
            '',
            window.location.pathname + (qs ? `?${qs}` : '') + window.location.hash,
          );
          try {
            setTokens(await api.oauthExchange(oauthCode));
            const me = await api.me();
            if (!active) return;
            setUser(me);
            setStatus('authenticated');
            return;
          } catch {
            /* fall through to the normal flow */
          }
        }

        const { needsSetup } = await api.setupStatus();
        if (!active) return;
        if (needsSetup) {
          setStatus('needsSetup');
          return;
        }
        if (getTokens()) {
          try {
            const me = await api.me();
            if (!active) return;
            setUser(me);
            setStatus('authenticated');
            return;
          } catch {
            clearTokens();
          }
        }
        setStatus('unauthenticated');
      } catch {
        if (active) setStatus('unauthenticated');
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const login = async (username: string, password: string): Promise<void> => {
    const tokens = await api.login(username, password);
    setTokens(tokens);
    setUser(await api.me());
    setStatus('authenticated');
  };

  const setup = async (username: string, password: string): Promise<void> => {
    const { user: created, tokens } = await api.setup(username, password);
    setTokens(tokens);
    setUser(created);
    setStatus('authenticated');
  };

  const logout = (): void => {
    clearTokens();
    setUser(null);
    setStatus('unauthenticated');
  };

  return (
    <AuthContext.Provider value={{ status, user, login, setup, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
