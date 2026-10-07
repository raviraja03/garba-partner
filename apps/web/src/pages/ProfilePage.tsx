import { Link } from 'react-router';
import { PageHeader } from '../components/PageHeader';
import { Alert } from '../components/ui/Alert';
import { LinkButton } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { EmptyState } from '../components/ui/EmptyState';
import { Icon, type IconName } from '../components/ui/Icon';
import { LoadingRegion, Skeleton, SkeletonCard } from '../components/ui/Skeleton';
import { CompletionCard } from '../features/profile/components/CompletionCard';
import { ProfileCard } from '../features/profile/components/ProfileCard';
import { useMyProfile, useProfilePreview } from '../features/profile/hooks';
import { formatLongDate } from '../lib/format';
import { PREFERRED_GENDER_LABELS } from '../lib/labels';

function ProfileSkeleton() {
  return (
    <LoadingRegion label="Loading your profile…" className="space-y-6">
      <Skeleton className="h-9 w-48" />
      <div className="grid gap-6 sm:grid-cols-[minmax(0,18rem)_minmax(0,1fr)]">
        <SkeletonCard aspect="aspect-[4/5]" />
        <div className="space-y-4">
          <Skeleton className="h-28 w-full rounded-card" />
          <Skeleton className="h-56 w-full rounded-card" />
        </div>
      </div>
    </LoadingRegion>
  );
}

/** Own profile: public preview, then what only the member sees, and their settings. */
export function ProfilePage() {
  const myProfile = useMyProfile();
  const preview = useProfilePreview(myProfile.data?.profile != null);

  if (myProfile.isPending) return <ProfileSkeleton />;
  if (myProfile.isError) {
    return (
      <EmptyState tone="error" title="We couldn't load your profile">
        Check your connection and refresh the page.
      </EmptyState>
    );
  }
  const { profile, preferences, completion, profileStatus } = myProfile.data;
  if (!profile || !preferences) return null;

  const settings: { to: string; label: string; hint: string; icon: IconName }[] = [
    {
      to: '/profile/edit#photo',
      label: profile.image ? 'Change photo' : 'Add photo',
      hint: 'A clear, recent photo of you',
      icon: 'user',
    },
    {
      to: '/profile/preferences',
      label: 'Preferences',
      hint: 'Who you see, and who sees you',
      icon: 'filter',
    },
    { to: '/bookings', label: 'My passes', hint: 'Event passes you bought', icon: 'ticket' },
    {
      to: '/profile/blocked',
      label: 'Blocked members',
      hint: 'People who can no longer reach you',
      icon: 'shield',
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="My profile"
        actions={
          <LinkButton to="/profile/edit" fullWidth className="sm:w-auto">
            Edit profile
          </LinkButton>
        }
      />

      {profileStatus !== 'complete' && (
        <Alert tone="warning" title="Your profile is hidden for now">
          Other members can&apos;t see your profile until the required fields are complete.
        </Alert>
      )}
      {completion.percentage < 100 && <CompletionCard completion={completion} />}

      <div className="grid items-start gap-6 sm:grid-cols-[minmax(0,18rem)_minmax(0,1fr)]">
        <section aria-labelledby="preview-title" className="space-y-3">
          <h2 id="preview-title" className="text-h3">
            How other members see you
          </h2>
          {preview.data ? (
            <ProfileCard profile={preview.data} />
          ) : preview.isError ? (
            <Alert tone="error">We couldn&apos;t load the preview.</Alert>
          ) : (
            <LoadingRegion label="Loading the preview…">
              <SkeletonCard aspect="aspect-[4/5]" />
            </LoadingRegion>
          )}
        </section>

        <div className="space-y-6">
          <Card as="section" aria-labelledby="private-title">
            <h2 id="private-title" className="flex items-center gap-2 text-h3">
              <Icon name="shield" className="size-5 text-brand-500" />
              Only visible to you
            </h2>
            <dl className="mt-4 divide-y divide-line text-small">
              {(
                [
                  ['Date of birth', formatLongDate(profile.dateOfBirth)],
                  ['Instagram', profile.instagramId ? `@${profile.instagramId}` : 'Not added'],
                  [
                    'Area',
                    profile.area
                      ? `${profile.area.name}${preferences.showArea ? '' : ' (hidden from others)'}`
                      : 'Not added',
                  ],
                  [
                    'Dance with',
                    `${PREFERRED_GENDER_LABELS[preferences.preferredGender]}, aged ${String(preferences.minAge)}–${String(preferences.maxAge)}${preferences.verifiedOnly ? ', photo-verified only' : ''}`,
                  ],
                  ['Discovery', preferences.discoveryEnabled ? 'Visible in discovery' : 'Paused'],
                ] as const
              ).map(([term, value]) => (
                <div key={term} className="flex justify-between gap-4 py-2.5">
                  <dt className="shrink-0 text-muted">{term}</dt>
                  <dd className="text-right font-medium text-ink">{value}</dd>
                </div>
              ))}
            </dl>
          </Card>

          <nav aria-label="Profile settings">
            <Card as="div" padding="none">
              <ul className="divide-y divide-line">
                {settings.map((item) => (
                  <li key={item.to}>
                    <Link
                      to={item.to}
                      className="flex min-h-16 items-center gap-3 px-4 py-3 transition-colors hover:bg-brand-50"
                    >
                      <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-brand-50 text-brand-600">
                        <Icon name={item.icon} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block font-semibold text-ink">{item.label}</span>
                        <span className="block text-caption text-muted">{item.hint}</span>
                      </span>
                      <Icon name="chevron-right" className="size-4 text-muted" />
                    </Link>
                  </li>
                ))}
              </ul>
            </Card>
          </nav>
        </div>
      </div>
    </div>
  );
}
