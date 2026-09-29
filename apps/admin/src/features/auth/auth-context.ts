import { createContext, useContext } from 'react';
import type { AdminMeDto, AdminPermission, AdminSessionDto } from '@garba-partner/shared';

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

/** UX only: hides controls the admin's role cannot use. The API enforces every permission. */
export function useHasPermission(permission: AdminPermission): boolean {
  const { state } = useAdminAuth();
  return state.status === 'authenticated' && state.admin.permissions.includes(permission);
}
