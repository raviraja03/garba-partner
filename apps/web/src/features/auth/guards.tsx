import { Navigate, Outlet, useLocation } from 'react-router';
import { FullPageSpinner } from '../../components/FullPageSpinner';
import { useAuth } from './auth-context';

/** Routes for logged-in members only. Anonymous visitors are sent to /login. */
export function RequireAuth() {
  const { state } = useAuth();
  const location = useLocation();

  if (state.status === 'loading') return <FullPageSpinner />;
  if (state.status === 'anonymous') {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }
  return <Outlet />;
}

/** Login screens: already-authenticated members go straight to the app. */
export function PublicOnly() {
  const { state } = useAuth();

  if (state.status === 'loading') return <FullPageSpinner />;
  if (state.status === 'authenticated') return <Navigate to="/" replace />;
  return <Outlet />;
}
