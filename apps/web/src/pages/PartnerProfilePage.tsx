import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { Alert } from '../components/ui/Alert';
import { Button } from '../components/ui/Button';
import { FullPageSpinner } from '../components/FullPageSpinner';
import { Highlights } from '../features/partners/components/PartnerCard';
import { SafetyActions } from '../features/partners/components/SafetyActions';
import { usePartner } from '../features/partners/hooks';
import { ProfileCard } from '../features/profile/components/ProfileCard';
import { formatShortDate } from '../lib/format';

/** A suggested partner's public profile, with Send interest, Block and Report. */
export function PartnerProfilePage() {
  const { userId = '' } = useParams();
  const partner = usePartner(userId);
  const [done, setDone] = useState<string | null>(null);
  const [interestNote, setInterestNote] = useState(false);

  if (done) {
    return (
      <div className="space-y-4">
        <Alert tone="info">{done}</Alert>
        <Link to="/discover" className="font-semibold text-brand-700 hover:underline">
          ← Back to Discover
        </Link>
      </div>
    );
  }
  if (partner.isPending) return <FullPageSpinner />;
  if (partner.isError) {
    // Blocked, hidden and unavailable profiles all look the same.
    return (
      <div className="space-y-4">
        <Alert tone="info">This profile isn&apos;t available.</Alert>
        <Link to="/discover" className="font-semibold text-brand-700 hover:underline">
          ← Back to Discover
        </Link>
      </div>
    );
  }

  const { profile, highlights, sharedDates, sharedEvents } = partner.data;
  return (
    <div className="space-y-5">
      <Link to="/discover" className="text-sm font-semibold text-brand-700 hover:underline">
        ← Discover
      </Link>

      <ProfileCard profile={profile} />

      {(highlights.length > 0 || sharedEvents.length > 0 || sharedDates.length > 0) && (
        <section className="space-y-2 rounded-card bg-white p-5 shadow-sm ring-1 ring-black/5">
          <h2 className="font-semibold">Why you&apos;re seeing {profile.name}</h2>
          <Highlights highlights={highlights} />
          {sharedEvents.length > 0 && (
            <p className="text-sm">
              You&apos;re both looking for a partner at{' '}
              {sharedEvents.map((event, i) => (
                <span key={event.id}>
                  {i > 0 && ', '}
                  <Link to={`/events/${event.slug}`} className="font-semibold hover:underline">
                    {event.name}
                  </Link>
                </span>
              ))}
              .
            </p>
          )}
          {sharedDates.length > 0 && (
            <p className="text-sm">
              You&apos;re both free on {sharedDates.map(formatShortDate).join(', ')}.
            </p>
          )}
          <p className="text-xs text-muted">
            These are simple signals, not a measure of compatibility. Badges show what was checked,
            never that someone is safe.
          </p>
        </section>
      )}

      <section className="space-y-3">
        <Button
          onClick={() => {
            setInterestNote(true);
          }}
        >
          Send interest
        </Button>
        {interestNote && (
          <Alert tone="info">
            Sending interests is launching soon. If {profile.name} accepts, a chat will open. No one
            can message you without your consent.
          </Alert>
        )}
      </section>

      <SafetyActions userId={profile.id} name={profile.name} onDone={setDone} />

      <section className="rounded-card bg-brand-50 p-4 text-sm text-brand-900 ring-1 ring-brand-200">
        <h2 className="font-semibold">Meet safely</h2>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li>Meet at the event or another busy, public place.</li>
          <li>Tell a friend who you&apos;re meeting and where.</li>
          <li>Never send money or share OTPs, passwords or your home address.</li>
        </ul>
      </section>
    </div>
  );
}
