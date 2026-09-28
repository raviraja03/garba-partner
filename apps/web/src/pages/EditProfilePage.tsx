import { useState } from 'react';
import { Link } from 'react-router';
import { Alert } from '../components/ui/Alert';
import { FullPageSpinner } from '../components/FullPageSpinner';
import { ImageUpload } from '../features/profile/components/ImageUpload';
import { ProfileForm } from '../features/profile/components/ProfileForm';
import { useMyProfile, useUpdateProfile } from '../features/profile/hooks';

export function EditProfilePage() {
  const myProfile = useMyProfile();
  const updateProfile = useUpdateProfile();
  const [saved, setSaved] = useState(false);

  if (myProfile.isPending) return <FullPageSpinner />;
  if (myProfile.isError || !myProfile.data.profile) {
    return <Alert tone="error">We couldn't load your profile.</Alert>;
  }
  const profile = myProfile.data.profile;

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-extrabold tracking-tight">Edit profile</h1>
        <Link to="/profile" className="text-sm font-semibold text-brand-700 hover:underline">
          Done
        </Link>
      </div>

      <section id="photo" aria-labelledby="photo-title" className="space-y-3">
        <h2 id="photo-title" className="font-semibold">
          Profile photo
        </h2>
        <ImageUpload image={profile.image} />
      </section>

      <section aria-labelledby="details-title" className="space-y-3">
        <h2 id="details-title" className="font-semibold">
          Details
        </h2>
        {saved && <Alert tone="info">Your profile was saved.</Alert>}
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
      </section>
    </div>
  );
}
