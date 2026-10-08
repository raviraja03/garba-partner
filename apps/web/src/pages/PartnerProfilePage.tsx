import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { Alert } from '../components/ui/Alert';
import { LinkButton } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { EmptyState } from '../components/ui/EmptyState';
import { Icon } from '../components/ui/Icon';
import { LoadingRegion, Skeleton, SkeletonCard } from '../components/ui/Skeleton';
import { InterestActions } from '../features/connections/components/InterestActions';
import { Highlights } from '../features/partners/components/PartnerCard';
import { SafetyActions } from '../features/partners/components/SafetyActions';
import { usePartner } from '../features/partners/hooks';
import { ProfileCard } from '../features/profile/components/ProfileCard';
import { formatShortDate } from '../lib/format';
import { BACK_LINK } from '../components/ui/link-styles';

function BackToDiscover() {
  return (
    <Link to="/discover" className={BACK_LINK}>
      <Icon name="arrow-left" className="size-4" />
      Discover
    </Link>
  );
}

/** A suggested partner's public profile, with Send interest, Block and Report. */
export function PartnerProfilePage() {
  const { userId = '' } = useParams();
  const partner = usePartner(userId);
  const [done, setDone] = useState<string | null>(null);

  if (done) {
    return (
      <div className="space-y-4">
        <h1 className="sr-only">Done</h1>
        <Alert tone="success">{done}</Alert>
        <LinkButton to="/discover" variant="secondary">
          <Icon name="arrow-left" className="size-4" />
          Back to Discover
        </LinkButton>
      </div>
    );
  }
  if (partner.isPending) {
    return (
      <LoadingRegion label="Loading profile…" className="space-y-4">
        <h1 className="sr-only">Loading profile</h1>
        <Skeleton className="h-6 w-24" />
        <div className="grid gap-6 sm:grid-cols-[minmax(0,20rem)_minmax(0,1fr)]">
          <SkeletonCard aspect="aspect-[4/5]" />
          <div className="space-y-4">
            <Skeleton className="h-14 w-full rounded-control" />
            <Skeleton className="h-40 w-full rounded-card" />
          </div>
        </div>
      </LoadingRegion>
    );
  }
  if (partner.isError) {
    // Blocked, hidden and unavailable profiles all look the same.
    return (
      <EmptyState
        icon="user"
        title="This profile isn't available"
        action={<LinkButton to="/discover">Back to Discover</LinkButton>}
      >
        <h1 className="sr-only">Profile not available</h1>
        The member may have paused their profile.
      </EmptyState>
    );
  }

  const { profile, highlights, sharedDates, sharedEvents } = partner.data;
  return (
    <div className="space-y-4">
      <BackToDiscover />

      <div className="grid items-start gap-x-6 gap-y-4 sm:grid-cols-[minmax(0,20rem)_minmax(0,1fr)] sm:grid-rows-[auto_1fr]">
        <div className="sm:row-span-2">
          <ProfileCard profile={profile} heading="h1" />
        </div>

        {/* On phones the photo fills the screen: keep the main action in reach while it scrolls. */}
        <div className="sticky bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-10 -mx-2 rounded-card bg-surface/95 p-2 shadow-raised backdrop-blur-sm sm:static sm:m-0 sm:bg-transparent sm:p-0 sm:shadow-none sm:backdrop-blur-none">
          <InterestActions partner={partner.data} />
        </div>

        <div className="space-y-5">
          {(highlights.length > 0 || sharedEvents.length > 0 || sharedDates.length > 0) && (
            <Card as="section" className="space-y-3">
              <h2 className="text-h3">Why you&apos;re seeing {profile.name}</h2>
              <Highlights highlights={highlights} />
              {sharedEvents.length > 0 && (
                <p className="text-small">
                  You&apos;re both looking for a partner at{' '}
                  {sharedEvents.map((event, i) => (
                    <span key={event.id}>
                      {i > 0 && ', '}
                      <Link
                        to={`/events/${event.slug}`}
                        className="font-semibold text-brand-700 underline"
                      >
                        {event.name}
                      </Link>
                    </span>
                  ))}
                  .
                </p>
              )}
              {sharedDates.length > 0 && (
                <p className="text-small">
                  You&apos;re both free on {sharedDates.map(formatShortDate).join(', ')}.
                </p>
              )}
              <p className="text-caption text-muted">
                These are simple signals, not a measure of compatibility. Badges show what was
                checked, never that someone is safe.
              </p>
            </Card>
          )}

          <section className="rounded-card bg-accent-yellow-soft p-5 text-primary ring-1 ring-accent-yellow/50">
            <h2 className="flex items-center gap-2 text-h3 text-primary">
              <Icon name="shield" />
              Meet safely
            </h2>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-small">
              <li>Meet at the event or another busy, public place.</li>
              <li>Tell a friend who you&apos;re meeting and where.</li>
              <li>Never send money or share OTPs, passwords or your home address.</li>
            </ul>
          </section>

          <SafetyActions userId={profile.id} name={profile.name} onDone={setDone} />
        </div>
      </div>
    </div>
  );
}
