import { FullPageSpinner } from '../components/FullPageSpinner';
import { PageHeader } from '../components/PageHeader';
import { EmptyState } from '../components/ui/EmptyState';
import { PreferencesForm } from '../features/profile/components/PreferencesForm';
import { useMyProfile } from '../features/profile/hooks';

export function PreferencesPage() {
  const myProfile = useMyProfile();

  if (myProfile.isPending) return <FullPageSpinner />;
  if (myProfile.isError || !myProfile.data.preferences) {
    return (
      <EmptyState tone="error" title="We couldn't load your preferences">
        Check your connection and refresh the page.
      </EmptyState>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Preferences"
        description="Who you'd like to dance with, and how visible you are."
        back={{ to: '/profile', label: 'My profile' }}
      />
      <PreferencesForm initial={myProfile.data.preferences} submitLabel="Save preferences" />
    </div>
  );
}
