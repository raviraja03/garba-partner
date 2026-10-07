import { Link } from 'react-router';
import type { EventCardDto } from '@garba-partner/shared';
import { Badge } from '../../../components/ui/Badge';
import { CARD_CLASS } from '../../../components/ui/Card';
import { Icon } from '../../../components/ui/Icon';
import { formatPaise } from '../../passes/format';
import { formatEventDate, formatTimeRange } from '../event-dates';
import { VerifiedBadge } from './VerifiedBadge';

/** Image or a branded placeholder, 16:9. Decorative: the event name is always printed nearby. */
export function EventImage({ url, name }: { url: string | null; name: string }) {
  return url ? (
    <img
      src={url}
      alt=""
      loading="lazy"
      decoding="async"
      className="aspect-video w-full bg-brand-100 object-cover"
    />
  ) : (
    <div
      aria-hidden="true"
      className="flex aspect-video w-full items-center justify-center bg-gradient-to-br from-brand-600 to-accent-600 text-5xl font-extrabold text-white/90"
    >
      {name.slice(0, 1).toUpperCase()}
    </div>
  );
}

/** Events list card: image, date, name, place, organizer, and the pass price when sold here. */
export function EventCard({ event }: { event: EventCardDto }) {
  return (
    <article
      className={`${CARD_CLASS} flex h-full flex-col overflow-hidden transition-[box-shadow,transform] duration-200 ease-soft hover:-translate-y-0.5 hover:shadow-raised`}
    >
      <Link to={`/events/${event.slug}`} className="flex h-full flex-col rounded-card">
        <div className="relative">
          <EventImage url={event.imageUrl} name={event.name} />
          <Badge tone="yellow" className="absolute top-3 left-3 shadow-card">
            {formatEventDate(event.eventDate)}
          </Badge>
          {event.hasEnded && (
            <Badge tone="neutral" className="absolute top-3 right-3 bg-card! shadow-card">
              Ended
            </Badge>
          )}
        </div>
        <div className="flex flex-1 flex-col gap-2 p-4">
          <h2 className="text-h3">{event.name}</h2>
          <p className="flex items-start gap-1.5 text-small text-muted">
            <Icon name="clock" className="mt-0.5 size-4" />
            {formatTimeRange(event.startTime, event.endTime)}
          </p>
          <p className="flex items-start gap-1.5 text-small text-muted">
            <Icon name="pin" className="mt-0.5 size-4" />
            <span>
              {event.venueName} · {event.area ? `${event.area.name}, ` : ''}
              {event.city.name}
            </span>
          </p>
          <p className="mt-auto flex flex-wrap items-center gap-x-2 gap-y-1.5 pt-1 text-small">
            <span className="text-ink">by {event.organizer.name}</span>
            {event.organizer.isVerified && <VerifiedBadge kind="organizer" />}
            {event.isVerified && <VerifiedBadge kind="event" />}
          </p>
          {/* Shown only when the API sends a price: some list responses leave the field out. */}
          {typeof event.passPricePaise === 'number' && !event.hasEnded && (
            <p className="flex items-center gap-1.5 border-t border-line pt-2.5 text-small font-semibold text-primary">
              <Icon name="ticket" className="size-4.5" />
              Passes from {formatPaise(event.passPricePaise)}
            </p>
          )}
        </div>
      </Link>
    </article>
  );
}
