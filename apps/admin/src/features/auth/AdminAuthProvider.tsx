import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { AdminSessionDto } from '@garba-partner/shared';
import { refreshSession, setAccessToken, setSessionExpiredHandler } from '../../lib/api-client';
import { logout } from './auth-api';
import { AdminAuthContext, type AdminAuthContextValue, type AdminAuthState } from './auth-context';

/** Admin session state. The access token lives only in memory; reloads go through refresh. */
export function AdminAuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AdminAuthState>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;
    setSessionExpiredHandler(() => {
      setState({ status: 'anonymous' });
    });

    refreshSession()
      .then((session) => {
        if (!cancelled) setState({ status: 'authenticated', admin: session.admin });
      })
      .catch(() => {
        if (!cancelled) setState({ status: 'anonymous' });
      });

    return () => {
      cancelled = true;
      setSessionExpiredHandler(null);
    };
  }, []);

  const signIn = useCallback((session: AdminSessionDto) => {
    setAccessToken(session.accessToken);
    setState({ status: 'authenticated', admin: session.admin });
  }, []);

  const signOut = useCallback(async () => {
    try {
      await logout();
    } finally {
      setAccessToken(null);
      setState({ status: 'anonymous' });
    }
  }, []);

  const value = useMemo<AdminAuthContextValue>(
    () => ({ state, signIn, signOut }),
    [state, signIn, signOut],
  );
  return <AdminAuthContext value={value}>{children}</AdminAuthContext>;
}
