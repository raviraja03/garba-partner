import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { MemberSessionDto } from '@garba-partner/shared';
import { refreshSession, setAccessToken, setSessionExpiredHandler } from '../../lib/api-client';
import { fetchMe, logout } from './auth-api';
import { AuthContext, type AuthContextValue, type AuthState } from './auth-context';

/**
 * Holds the member session. On load it asks the API to refresh (the httpOnly cookie decides);
 * the access token lives only in memory, so a page reload always goes through refresh.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;
    setSessionExpiredHandler(() => {
      setState({ status: 'anonymous' });
    });

    refreshSession()
      .then((session) => {
        if (!cancelled) setState({ status: 'authenticated', user: session.user });
      })
      .catch(() => {
        if (!cancelled) setState({ status: 'anonymous' });
      });

    return () => {
      cancelled = true;
      setSessionExpiredHandler(null);
    };
  }, []);

  const signIn = useCallback((session: MemberSessionDto) => {
    setAccessToken(session.accessToken);
    setState({ status: 'authenticated', user: session.user });
  }, []);

  const signOut = useCallback(async () => {
    try {
      await logout();
    } finally {
      // Clear local state even if the server call fails (e.g. offline).
      setAccessToken(null);
      setState({ status: 'anonymous' });
    }
  }, []);

  const refreshUser = useCallback(async () => {
    try {
      const user = await fetchMe();
      setState({ status: 'authenticated', user });
    } catch {
      // A failed refresh leaves the current state; a real session loss is handled by the client.
    }
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({ state, signIn, signOut, refreshUser }),
    [state, signIn, signOut, refreshUser],
  );
  return <AuthContext value={value}>{children}</AuthContext>;
}
