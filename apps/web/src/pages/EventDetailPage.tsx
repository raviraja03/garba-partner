import type { ReactNode } from 'react';
import { Link, useParams } from 'react-router';
import type { EventDetailDto } from '@garba-partner/shared';
import { Alert } from '../components/ui/Alert';
import { Button, LinkButton } from '../components/ui/Button';
import { buttonClass } from '../components/ui/button-styles';
import { Card } from '../components/ui/Card';
import { EmptyState } from '../components/ui/EmptyState';
import { Icon, type IconName } from '../components/ui/Icon';
import { LoadingRegion, Skeleton } from '../components/ui/Skeleton';
import { EventImage } from '../features/events/components/EventCard';
import { VerifiedBadge } from '../features/events/components/VerifiedBadge';
import { formatEventDate, formatTimeRange, linkHost } from '../features/events/event-dates';
import { useEvent } from '../features/events/hooks';
import { VERIFIED_EVENT_NOTE, VERIFIED_ORGANIZER_NOTE } from '../features/events/verified-copy';
import { BuyPass } from '../features/passes/BuyPass';
import { ApiClientError } from '../lib/api-client';
import { BACK_LINK, TEXT_LINK } from '../components/ui/link-styles';

/** Opens in a new tab without giving the other site access to this page. */
const EXTERNAL = { target: '_blank', rel: 'noopener noreferrer nofollow' } as const;

function mapsUrl(event: EventDetailDto): string {
  const query = `${event.venueName}, ${event.venueAddress}, ${event.city.name}`;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}

/** One key fact: icon, small label, value. */
function Fact({ icon, label, children }: { icon: IconName; label: string; children: ReactNode }) {
  return (
    <div className="flex gap-3">
      <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-brand-50 text-brand-600">
        <Icon name={icon} />
      </span>
      <div className="min-w-0">
        <dt className="text-caption font-semibold text-muted">{label}</dt>
        <dd className="text-ink">{children}</dd>
      </div>
    </div>
  );
}

/** The event's actions: find a partner (the headline action), then the pass. */
function CallsToAction({ event }: { event: EventDetailDto }) {
  const passHost = event.ticketUrl ? linkHost(event.ticketUrl) : null;
  return (
    <Card as="section" aria-label="Actions" className="space-y-4">
      <div className="space-y-2">
        <LinkButton to={`/events/${event.slug}/find-partner`} variant="cta" fullWidth>
          <Icon name="users" />
          Find a partner
        </LinkButton>
        <p className="text-center text-caption text-muted">
          See who else is looking for a partner at this event.
        </p>
      </div>
      <div className="border-t border-line pt-4">
        {event.pass ? (
          <BuyPass event={event} pass={event.pass} />
        ) : event.ticketUrl ? (
          <div className="space-y-2">
            <a
              href={event.ticketUrl}
              {...EXTERNAL}
              className={buttonClass({ variant: 'secondary', fullWidth: true })}
            >
              Get pass{passHost ? ` on ${passHost}` : ''}
              <Icon name="external" className="size-4" label="(opens in a new tab)" />
            </a>
            <p className="text-caption text-muted">
              Passes for this event are sold by the organizer on their own site. GarbaMates never
              asks you to pay another member.
            </p>
          </div>
        ) : (
          <p className="rounded-control bg-brand-900/5 px-4 py-3 text-center text-small text-muted">
            Pass details coming soon
          </p>
        )}
      </div>
    </Card>
  );
}

export function EventDetailPage() {
  const { idOrSlug = '' } = useParams();
  const query = useEvent(idOrSlug);

  if (query.isPending) {
    return (
      <LoadingRegion label="Loading event…" className="space-y-5">
        <h1 className="sr-only">Loading event</h1>
        <Skeleton className="h-6 w-28" />
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
          <div className="space-y-4">
            <Skeleton className="aspect-video w-full rounded-card" />
            <Skeleton className="h-9 w-2/3" />
            <Skeleton className="h-32 w-full rounded-card" />
          </div>
          <Skeleton className="h-64 w-full rounded-card" />
        </div>
      </LoadingRegion>
    );
  }
  if (query.isError) {
    const notFound = query.error instanceof ApiClientError && query.error.status === 404;
    return (
      <EmptyState
        tone={notFound ? 'default' : 'error'}
        icon="calendar"
        title={notFound ? "This event isn't available" : "We couldn't load this event"}
        action={
          notFound ? (
            <LinkButton to="/events">Browse all events</LinkButton>
          ) : (
            <Button variant="secondary" fullWidth={false} onClick={() => void query.refetch()}>
              Try again
            </Button>
          )
        }
      >
        <h1 className="sr-only">Event not available</h1>
        {notFound ? 'It may have been removed or unpublished.' : query.error.message}
      </EmptyState>
    );
  }

  const event = query.data;
  const { organizer } = event;
  return (
    <article className="space-y-4">
      <Link to="/events" className={BACK_LINK}>
        <Icon name="arrow-left" className="size-4" />
        All events
      </Link>

      {/* Phone order: what and when → actions → the rest. Desktop: actions in a sticky side column. */}
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_22rem] lg:grid-rows-[auto_1fr]">
        <div className="space-y-5">
          {/* A shorter banner on tablets, where 16:9 would push the details off the first screen. */}
          <div className="overflow-hidden rounded-card shadow-card ring-1 ring-brand-900/5 sm:max-lg:[&>*]:aspect-[21/9]">
            <EventImage url={event.imageUrl} name={event.name} />
          </div>

          <header className="space-y-3">
            <h1 className="text-h1">{event.name}</h1>
            {(organizer.isVerified || event.isVerified) && (
              <p className="flex flex-wrap gap-2">
                {organizer.isVerified && <VerifiedBadge kind="organizer" />}
                {event.isVerified && <VerifiedBadge kind="event" />}
              </p>
            )}
          </header>

          <Card>
            <dl className="grid gap-5 sm:grid-cols-2">
              <Fact icon="calendar" label="Date">
                {formatEventDate(event.eventDate)}
              </Fact>
              <Fact icon="clock" label="Time (IST)">
                {formatTimeRange(event.startTime, event.endTime)}
              </Fact>
              <Fact icon="pin" label="Venue">
                <span className="font-semibold">{event.venueName}</span>
                <br />
                <span className="text-small text-muted">
                  {event.venueAddress}
                  {event.area ? `, ${event.area.name}` : ''}, {event.city.name}
                </span>
                <br />
                <a href={mapsUrl(event)} {...EXTERNAL} className={`text-small ${TEXT_LINK}`}>
                  Open in Maps
                </a>
              </Fact>
              <Fact icon="users" label="Organizer">
                <span className="font-semibold">{organizer.name}</span>
                {organizer.instagramHandle && (
                  <>
                    <br />
                    <a
                      href={`https://www.instagram.com/${organizer.instagramHandle}/`}
                      {...EXTERNAL}
                      className={`text-small ${TEXT_LINK}`}
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
                      className={`text-small ${TEXT_LINK}`}
                    >
                      {linkHost(organizer.websiteUrl) ?? 'Website'}
                    </a>
                  </>
                )}
              </Fact>
            </dl>
          </Card>
        </div>

        <aside className="space-y-4 lg:sticky lg:top-22 lg:row-span-2">
          {event.hasEnded ? (
            <Alert tone="info">This event has ended.</Alert>
          ) : (
            <CallsToAction event={event} />
          )}
        </aside>

        <div className="space-y-6">
          <section className="space-y-2">
            <h2>About this event</h2>
            <p className="max-w-prose whitespace-pre-line">{event.description}</p>
          </section>

          {organizer.description && (
            <section className="space-y-2">
              <h2>About {organizer.name}</h2>
              <p className="max-w-prose whitespace-pre-line">{organizer.description}</p>
            </section>
          )}

          {(organizer.isVerified || event.isVerified) && (
            <section className="rounded-card bg-success-soft p-5 text-small text-success ring-1 ring-success/20">
              <h2 className="text-h3 text-success">What “verified” means</h2>
              {organizer.isVerified && <p className="mt-1">{VERIFIED_ORGANIZER_NOTE}</p>}
              {event.isVerified && <p className="mt-1">{VERIFIED_EVENT_NOTE}</p>}
            </section>
          )}

          <section className="rounded-card bg-accent-yellow-soft p-5 text-primary ring-1 ring-accent-yellow/50">
            <h2 className="flex items-center gap-2 text-h3 text-primary">
              <Icon name="shield" />
              Stay safe at the event
            </h2>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-small">
              <li>Meet your partner at the venue, in a busy, well-lit area.</li>
              <li>Tell a friend where you are going and who you are meeting.</li>
              <li>Never send money or share passwords, OTPs or your address.</li>
            </ul>
          </section>
        </div>
      </div>
    </article>
  );
}
