import { Link, useParams } from 'react-router';
import { Alert } from '../components/ui/Alert';
import { FullPageSpinner } from '../components/FullPageSpinner';
import { formatEventDate } from '../features/events/event-dates';
import { useEvent } from '../features/events/hooks';
import { useMyProfile } from '../features/profile/hooks';

/**
 * Target of the event page's "Find a partner" call to action. Signed-in members with a profile
 * only (anonymous visitors are sent to log in first and brought back here). Partner matching for
 * events is a later phase, so this page says so honestly and helps the member get ready.
 */
export function FindPartnerPage() {
  const { idOrSlug = '' } = useParams();
  const event = useEvent(idOrSlug);
  const profile = useMyProfile();

  if (event.isPending) return <FullPageSpinner />;
  if (event.isError) return <Alert tone="error">This event is not available.</Alert>;

  const complete = profile.data?.profileStatus === 'complete';
  return (
    <div className="space-y-6">
      <Link
        to={`/events/${event.data.slug}`}
        className="text-sm font-semibold text-brand-700 hover:underline"
      >
        ← {event.data.name}
      </Link>
      <h1 className="text-3xl font-extrabold tracking-tight">Find a partner</h1>
      <section className="rounded-card bg-white p-6 shadow-sm ring-1 ring-black/5">
        <h2 className="font-semibold text-brand-700">Partner matching is coming soon</h2>
        <p className="mt-2 text-sm text-muted">
          Soon you&apos;ll be able to see other members looking for a partner for{' '}
          <strong className="text-ink">{event.data.name}</strong> on{' '}
          {formatEventDate(event.data.eventDate)}. Only members who also choose to look for a
          partner at this event will see you, and never your phone number or exact location.
        </p>
        {complete ? (
          <p className="mt-4 text-sm">Your profile is ready. You&apos;re all set for launch.</p>
        ) : (
          <Link
            to="/profile/edit"
            className="mt-4 inline-block rounded-xl bg-brand-600 px-5 py-3 font-semibold text-white hover:bg-brand-700"
          >
            Finish your profile
          </Link>
        )}
      </section>
    </div>
  );
}
