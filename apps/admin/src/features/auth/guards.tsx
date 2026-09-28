import { Navigate, Outlet, useLocation } from 'react-router';
import type { AdminPermission } from '@garba-partner/shared';
import { FullPageSpinner } from '../../components/FullPageSpinner';
import { useAdminAuth } from './auth-context';

/**
 * Protected admin routes. Optionally requires a permission. This only hides UI — the API
 * enforces every permission server-side.
 */
export function RequireAdmin({ permission }: { permission?: AdminPermission }) {
  const { state } = useAdminAuth();
  const location = useLocation();

  if (state.status === 'loading') return <FullPageSpinner />;
  if (state.status === 'anonymous') {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }
  if (permission && !state.admin.permissions.includes(permission)) {
    return <Navigate to="/" replace />;
  }
  return <Outlet />;
}

export function PublicOnly() {
  const { state } = useAdminAuth();

  if (state.status === 'loading') return <FullPageSpinner />;
  if (state.status === 'authenticated') return <Navigate to="/" replace />;
  return <Outlet />;
}
