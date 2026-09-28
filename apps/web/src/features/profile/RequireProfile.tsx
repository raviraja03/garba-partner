import { Navigate, Outlet } from 'react-router';
import { Alert } from '../../components/ui/Alert';
import { FullPageSpinner } from '../../components/FullPageSpinner';
import { useMyProfile } from './hooks';

/** Members without a profile are sent to onboarding first. */
export function RequireProfile() {
  const { data, isPending, isError } = useMyProfile();

  if (isPending) return <FullPageSpinner />;
  if (isError) return <Alert tone="error">We couldn't load your profile. Please refresh.</Alert>;
  if (data.profileStatus === 'not_started') return <Navigate to="/onboarding" replace />;
  return <Outlet />;
}
