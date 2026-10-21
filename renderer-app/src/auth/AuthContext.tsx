import { useQueryClient } from '@tanstack/react-query';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api } from '@/api/endpoints';
import { onDeviceRejected, onUnauthorized } from '@/api/client';
import type { Session } from '@/api/types';
import { isAdmin, isClerk, isInternalStaff } from './nav';

interface AuthValue {
  session: Session | null;
  /** Message shown on the login page after a forced sign-out (expired session, unlicensed device). */
  notice: string;
  deviceRejected: boolean;
  isAdmin: boolean;
  isClerk: boolean;
  isInternalStaff: boolean;
  login(username: string, password: string): Promise<Session>;
  logout(): Promise<void>;
  clearNotice(): void;
}

const AuthContext = createContext<AuthValue | null>(null);

/** Holds the signed-in session in memory (the token itself never leaves the main process). */
export function AuthProvider({ children, initial = null }: { children: ReactNode; initial?: Session | null }) {
  const [session, setSession] = useState<Session | null>(initial);
  const [notice, setNotice] = useState('');
  const [deviceRejected, setDeviceRejected] = useState(false);
  const queryClient = useQueryClient();

  useEffect(
    () =>
      onUnauthorized(() => {
        setSession((s) => {
          if (s) setNotice('انتهت الجلسة — سجّل الدخول من جديد.');
          return null;
        });
        queryClient.clear();
      }),
    [queryClient],
  );
  useEffect(() => onDeviceRejected(() => setDeviceRejected(true)), []);

  const login = useCallback(async (username: string, password: string) => {
    const next = await api.login(username, password);
    setNotice('');
    setDeviceRejected(false);
    setSession(next);
    return next;
  }, []);

  const logout = useCallback(async () => {
    setSession(null);
    queryClient.clear();
    try {
      await api.logout();
    } catch {
      /* session is already cleared locally */
    }
  }, [queryClient]);

  const value = useMemo<AuthValue>(
    () => ({
      session,
      notice,
      deviceRejected,
      isAdmin: isAdmin(session),
      isClerk: isClerk(session),
      isInternalStaff: isInternalStaff(session),
      login,
      logout,
      clearNotice: () => setNotice(''),
    }),
    [session, notice, deviceRejected, login, logout],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
