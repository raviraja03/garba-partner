import { useState } from 'react';
import { FullPageSpinner } from '../components/FullPageSpinner';
import { PageHeader } from '../components/PageHeader';
import { Alert } from '../components/ui/Alert';
import { Card } from '../components/ui/Card';
import { EmptyState } from '../components/ui/EmptyState';
import { ImageUpload } from '../features/profile/components/ImageUpload';
import { ProfileForm } from '../features/profile/components/ProfileForm';
import { useMyProfile, useUpdateProfile } from '../features/profile/hooks';

export function EditProfilePage() {
  const myProfile = useMyProfile();
  const updateProfile = useUpdateProfile();
  const [saved, setSaved] = useState(false);

  if (myProfile.isPending) return <FullPageSpinner />;
  if (myProfile.isError || !myProfile.data.profile) {
    return (
      <EmptyState tone="error" title="We couldn't load your profile">
        Check your connection and refresh the page.
      </EmptyState>
    );
  }
  const profile = myProfile.data.profile;

  return (
    <div className="space-y-6">
      <PageHeader title="Edit profile" back={{ to: '/profile', label: 'My profile' }} />

      <Card as="section" id="photo" aria-labelledby="photo-title" className="space-y-4">
        <h2 id="photo-title" className="text-h3">
          Profile photo
        </h2>
        <ImageUpload image={profile.image} />
      </Card>

      <section aria-labelledby="details-title" className="space-y-4">
        <h2 id="details-title" className="sr-only">
          Details
        </h2>
        <ProfileForm
          key={profile.updatedAt}
          mode="edit"
          initial={profile}
          submitLabel="Save changes"
          onUpdate={async (input) => {
            setSaved(false);
            await updateProfile.mutateAsync(input);
            setSaved(true);
          }}
        />
        {saved && <Alert tone="success">Your profile was saved.</Alert>}
      </section>
    </div>
  );
}
