import { Outlet } from 'react-router';
import { FullPageSpinner } from '../../components/FullPageSpinner';
import { LandingPage } from '../../pages/LandingPage';
import { useAuth } from '../auth/auth-context';

/**
 * `/` is two pages at one address: visitors see the landing page, signed-in members continue to
 * their own home (through the same profile check as every other member page).
 */
export function HomeGate() {
  const { state } = useAuth();
  if (state.status === 'loading') return <FullPageSpinner />;
  if (state.status === 'anonymous') return <LandingPage />;
  return <Outlet />;
}
