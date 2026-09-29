import { Link } from 'react-router';
import { Alert } from '../components/ui/Alert';
import { FullPageSpinner } from '../components/FullPageSpinner';
import { CompletionCard } from '../features/profile/components/CompletionCard';
import { ProfileCard } from '../features/profile/components/ProfileCard';
import { useMyProfile, useProfilePreview } from '../features/profile/hooks';
import { formatLongDate } from '../lib/format';
import { PREFERRED_GENDER_LABELS } from '../lib/labels';

const LINK_CLASS =
  'rounded-xl bg-white px-4 py-3 text-center font-semibold ring-1 ring-black/10 hover:bg-brand-50';

/** Own profile: completion, public preview, private details and preferences. */
export function ProfilePage() {
  const myProfile = useMyProfile();
  const preview = useProfilePreview(myProfile.data?.profile != null);

  if (myProfile.isPending) return <FullPageSpinner />;
  if (myProfile.isError) return <Alert tone="error">We couldn't load your profile.</Alert>;
  const { profile, preferences, completion, profileStatus } = myProfile.data;
  if (!profile || !preferences) return null;

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-extrabold tracking-tight">My profile</h1>
      <CompletionCard completion={completion} />

      {profileStatus !== 'complete' && (
        <Alert tone="info">
          Other members can't see your profile until the required fields are complete.
        </Alert>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <Link to="/profile/edit" className={LINK_CLASS}>
          Edit profile
        </Link>
        <Link to="/profile/edit#photo" className={LINK_CLASS}>
          {profile.image ? 'Change photo' : 'Add photo'}
        </Link>
        <Link to="/profile/blocked" className={LINK_CLASS}>
          Blocked members
        </Link>
        <Link to="/profile/preferences" className={LINK_CLASS}>
          Preferences
        </Link>
      </div>

      <section aria-labelledby="preview-title" className="space-y-3">
        <h2 id="preview-title" className="font-semibold">
          How other members see you
        </h2>
        <div className="max-w-sm">
          {preview.data ? <ProfileCard profile={preview.data} /> : <FullPageSpinner />}
        </div>
      </section>

      <section
        aria-labelledby="private-title"
        className="rounded-card bg-white p-5 shadow-sm ring-1 ring-black/5"
      >
        <h2 id="private-title" className="font-semibold">
          Only visible to you
        </h2>
        <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
          <dt className="text-muted">Date of birth</dt>
          <dd>{formatLongDate(profile.dateOfBirth)}</dd>
          <dt className="text-muted">Instagram</dt>
          <dd>{profile.instagramId ? `@${profile.instagramId}` : '—'}</dd>
          <dt className="text-muted">Area</dt>
          <dd>
            {profile.area?.name ?? '—'}
            {profile.area && !preferences.showArea && ' (hidden from others)'}
          </dd>
          <dt className="text-muted">Dance with</dt>
          <dd>
            {PREFERRED_GENDER_LABELS[preferences.preferredGender]}, aged {preferences.minAge}–
            {preferences.maxAge}
            {preferences.verifiedOnly && ', photo-verified only'}
          </dd>
          <dt className="text-muted">Discovery</dt>
          <dd>{preferences.discoveryEnabled ? 'Visible in discovery' : 'Paused'}</dd>
        </dl>
      </section>
    </div>
  );
}
