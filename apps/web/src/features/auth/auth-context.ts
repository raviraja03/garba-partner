import { createContext, useContext } from 'react';
import type { MeDto, MemberSessionDto } from '@garba-partner/shared';

export type AuthState =
  { status: 'loading' } | { status: 'anonymous' } | { status: 'authenticated'; user: MeDto };

export interface AuthContextValue {
  state: AuthState;
  /** Stores a session returned by verify-otp. */
  signIn: (session: MemberSessionDto) => void;
  /** Revokes the session on the server and clears local state. */
  signOut: () => Promise<void>;
  /** Re-reads /auth/me (e.g. after the profile changed). */
  refreshUser: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside <AuthProvider>');
  return value;
}
