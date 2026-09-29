import type { ReactNode } from 'react';
import { Link, useParams } from 'react-router';
import type { EventDetailDto } from '@garba-partner/shared';
import { Alert } from '../components/ui/Alert';
import { FullPageSpinner } from '../components/FullPageSpinner';
import { EventImage } from '../features/events/components/EventCard';
import { VerifiedBadge } from '../features/events/components/VerifiedBadge';
import { formatEventDate, formatTimeRange, linkHost } from '../features/events/event-dates';
import { useEvent } from '../features/events/hooks';
import { VERIFIED_EVENT_NOTE, VERIFIED_ORGANIZER_NOTE } from '../features/events/verified-copy';
import { ApiClientError } from '../lib/api-client';

/** Opens in a new tab without giving the other site access to this page. */
const EXTERNAL = { target: '_blank', rel: 'noopener noreferrer nofollow' } as const;

function mapsUrl(event: EventDetailDto): string {
  const query = `${event.venueName}, ${event.venueAddress}, ${event.city.name}`;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}

function Detail({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-semibold tracking-wide text-muted uppercase">{label}</dt>
      <dd className="mt-0.5">{children}</dd>
    </div>
  );
}

function CallsToAction({ event }: { event: EventDetailDto }) {
  const passHost = event.ticketUrl ? linkHost(event.ticketUrl) : null;
  return (
    <section aria-label="Actions" className="grid gap-3 sm:grid-cols-2">
      <Link
        to={`/events/${event.slug}/find-partner`}
        className="rounded-xl bg-brand-600 px-4 py-3 text-center font-semibold text-white shadow-sm hover:bg-brand-700"
      >
        Find a partner
      </Link>
      {event.ticketUrl ? (
        <a
          href={event.ticketUrl}
          {...EXTERNAL}
          className="rounded-xl bg-white px-4 py-3 text-center font-semibold ring-1 ring-black/10 hover:bg-brand-50"
        >
          Get pass
          {passHost && (
            <span className="block text-xs font-normal text-muted">on {passHost} ↗</span>
          )}
        </a>
      ) : (
        <p className="rounded-xl bg-black/5 px-4 py-3 text-center text-sm text-muted">
          Pass details coming soon
        </p>
      )}
      {event.ticketUrl && (
        <p className="text-xs text-muted sm:col-span-2">
          Passes are sold by the organizer on their own site. Garba Partner does not sell passes and
          never asks you to pay another member.
        </p>
      )}
    </section>
  );
}

export function EventDetailPage() {
  const { idOrSlug = '' } = useParams();
  const query = useEvent(idOrSlug);

  if (query.isPending) return <FullPageSpinner />;
  if (query.isError) {
    const notFound = query.error instanceof ApiClientError && query.error.status === 404;
    return (
      <div className="space-y-4">
        <Alert tone="error">
          {notFound ? 'This event is not available.' : query.error.message}
        </Alert>
        <Link to="/events" className="font-semibold text-brand-700 hover:underline">
          ← All events
        </Link>
      </div>
    );
  }

  const event = query.data;
  const { organizer } = event;
  return (
    <article className="space-y-6">
      <Link to="/events" className="text-sm font-semibold text-brand-700 hover:underline">
        ← All events
      </Link>

      <div className="overflow-hidden rounded-card shadow-sm ring-1 ring-black/5">
        <EventImage url={event.imageUrl} name={event.name} />
      </div>

      <header className="space-y-2">
        <h1 className="text-3xl font-extrabold tracking-tight">{event.name}</h1>
        <p className="flex flex-wrap gap-2">
          {organizer.isVerified && <VerifiedBadge kind="organizer" />}
          {event.isVerified && <VerifiedBadge kind="event" />}
        </p>
      </header>

      {event.hasEnded ? (
        <Alert tone="info">This event has ended.</Alert>
      ) : (
        <CallsToAction event={event} />
      )}

      <dl className="grid gap-4 rounded-card bg-white p-5 shadow-sm ring-1 ring-black/5 sm:grid-cols-2">
        <Detail label="Date">{formatEventDate(event.eventDate)}</Detail>
        <Detail label="Time (IST)">{formatTimeRange(event.startTime, event.endTime)}</Detail>
        <Detail label="Venue">
          <span className="font-semibold">{event.venueName}</span>
          <br />
          {event.venueAddress}
          {event.area ? `, ${event.area.name}` : ''}, {event.city.name}
          <br />
          <a
            href={mapsUrl(event)}
            {...EXTERNAL}
            className="text-sm font-semibold text-brand-700 hover:underline"
          >
            Open in Maps ↗
          </a>
        </Detail>
        <Detail label="Organizer">
          <span className="font-semibold">{organizer.name}</span>
          {organizer.instagramHandle && (
            <>
              <br />
              <a
                href={`https://www.instagram.com/${organizer.instagramHandle}/`}
                {...EXTERNAL}
                className="text-sm text-brand-700 hover:underline"
              >
                @{organizer.instagramHandle}
              </a>
            </>
          )}
          {organizer.websiteUrl && (
            <>
              <br />
              <a
                href={organizer.websiteUrl}
                {...EXTERNAL}
                className="text-sm text-brand-700 hover:underline"
              >
                {linkHost(organizer.websiteUrl) ?? 'Website'} ↗
              </a>
            </>
          )}
        </Detail>
      </dl>

      <section className="space-y-2">
        <h2 className="text-xl font-bold">About this event</h2>
        <p className="whitespace-pre-line">{event.description}</p>
      </section>

      {organizer.description && (
        <section className="space-y-2">
          <h2 className="text-xl font-bold">About {organizer.name}</h2>
          <p className="whitespace-pre-line">{organizer.description}</p>
        </section>
      )}

      {(organizer.isVerified || event.isVerified) && (
        <section className="rounded-card bg-green-50 p-4 text-sm text-green-900 ring-1 ring-green-200">
          <h2 className="font-semibold">What “verified” means</h2>
          {organizer.isVerified && <p className="mt-1">{VERIFIED_ORGANIZER_NOTE}</p>}
          {event.isVerified && <p className="mt-1">{VERIFIED_EVENT_NOTE}</p>}
        </section>
      )}

      <section className="rounded-card bg-brand-50 p-4 text-sm text-brand-900 ring-1 ring-brand-200">
        <h2 className="font-semibold">Stay safe at the event</h2>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li>Meet your partner at the venue, in a busy, well-lit area.</li>
          <li>Tell a friend where you are going and who you are meeting.</li>
          <li>Never send money or share passwords, OTPs or your address.</li>
        </ul>
      </section>
    </article>
  );
}
