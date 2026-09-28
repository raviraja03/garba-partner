import { createContext, useContext } from 'react';
import type { AdminMeDto, AdminSessionDto } from '@garba-partner/shared';

export type AdminAuthState =
  { status: 'loading' } | { status: 'anonymous' } | { status: 'authenticated'; admin: AdminMeDto };

export interface AdminAuthContextValue {
  state: AdminAuthState;
  signIn: (session: AdminSessionDto) => void;
  signOut: () => Promise<void>;
}

export const AdminAuthContext = createContext<AdminAuthContextValue | null>(null);

export function useAdminAuth(): AdminAuthContextValue {
  const value = useContext(AdminAuthContext);
  if (!value) throw new Error('useAdminAuth must be used inside <AdminAuthProvider>');
  return value;
}
