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
