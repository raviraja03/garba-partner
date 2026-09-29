import { Link } from 'react-router';
import type { EventCardDto } from '@garba-partner/shared';
import { formatEventDate, formatTimeRange } from '../event-dates';
import { VerifiedBadge } from './VerifiedBadge';

/** Image or a branded placeholder, 16:9. */
export function EventImage({ url, name }: { url: string | null; name: string }) {
  return url ? (
    <img src={url} alt="" loading="lazy" className="aspect-video w-full object-cover" />
  ) : (
    <div
      aria-hidden="true"
      className="flex aspect-video w-full items-center justify-center bg-gradient-to-br from-brand-400 to-accent-600 text-5xl font-extrabold text-white/90"
    >
      {name.slice(0, 1).toUpperCase()}
    </div>
  );
}

export function EventCard({ event }: { event: EventCardDto }) {
  return (
    <article className="overflow-hidden rounded-card bg-white shadow-sm ring-1 ring-black/5 transition-shadow hover:shadow-md">
      <Link
        to={`/events/${event.slug}`}
        className="block focus-visible:outline-2 focus-visible:outline-brand-600"
      >
        <EventImage url={event.imageUrl} name={event.name} />
        <div className="space-y-2 p-4">
          <p className="text-xs font-semibold tracking-wide text-brand-700 uppercase">
            {formatEventDate(event.eventDate)} · {formatTimeRange(event.startTime, event.endTime)}
          </p>
          <h2 className="text-lg leading-snug font-bold">{event.name}</h2>
          <p className="text-sm text-muted">
            {event.venueName} · {event.area ? `${event.area.name}, ` : ''}
            {event.city.name}
          </p>
          <p className="flex flex-wrap items-center gap-2 text-sm">
            <span>by {event.organizer.name}</span>
            {event.organizer.isVerified && <VerifiedBadge kind="organizer" />}
            {event.isVerified && <VerifiedBadge kind="event" />}
          </p>
        </div>
      </Link>
    </article>
  );
}
