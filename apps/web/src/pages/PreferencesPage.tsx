import { Link } from 'react-router';
import { Alert } from '../components/ui/Alert';
import { FullPageSpinner } from '../components/FullPageSpinner';
import { PreferencesForm } from '../features/profile/components/PreferencesForm';
import { useMyProfile } from '../features/profile/hooks';

export function PreferencesPage() {
  const myProfile = useMyProfile();

  if (myProfile.isPending) return <FullPageSpinner />;
  if (myProfile.isError || !myProfile.data.preferences) {
    return <Alert tone="error">We couldn't load your preferences.</Alert>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-extrabold tracking-tight">Preferences</h1>
        <Link to="/profile" className="text-sm font-semibold text-brand-700 hover:underline">
          Back to profile
        </Link>
      </div>
      <PreferencesForm initial={myProfile.data.preferences} submitLabel="Save preferences" />
    </div>
  );
}
