import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { Link, useParams } from 'react-router';
import { PageHeader } from '../components/PageHeader';
import { Alert } from '../components/ui/Alert';
import { Badge } from '../components/ui/Badge';
import { Button, LinkButton } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { EmptyState } from '../components/ui/EmptyState';
import { Icon } from '../components/ui/Icon';
import { LoadingRegion, Skeleton, SkeletonRow } from '../components/ui/Skeleton';
import { bookingStatusText, formatPaise, REFUND_LABELS } from '../features/passes/format';
import { fetchBooking, fetchBookings } from '../features/passes/passes-api';
import { BACK_LINK } from '../components/ui/link-styles';

const when = (iso: string) =>
  new Intl.DateTimeFormat('en-IN', {
    timeZone: 'Asia/Kolkata',
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(iso));

/** "My passes": the member's bookings, newest first. */
export function BookingsPage() {
  const list = useInfiniteQuery({
    queryKey: ['bookings'],
    queryFn: ({ pageParam }) => fetchBookings(pageParam),
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.nextCursor,
  });
  const items = list.data?.pages.flatMap((page) => page.items) ?? [];

  return (
    <div className="space-y-6">
      <PageHeader title="My passes" description="Event passes you bought on GarbaMates." />
      {list.isPending && (
        <LoadingRegion label="Loading your passes…" className="space-y-3">
          <SkeletonRow />
          <SkeletonRow />
        </LoadingRegion>
      )}
      {list.isError && (
        <EmptyState
          tone="error"
          title="We couldn't load your passes"
          action={
            <Button variant="secondary" fullWidth={false} onClick={() => void list.refetch()}>
              Try again
            </Button>
          }
        >
          {list.error.message}
        </EmptyState>
      )}
      {list.isSuccess && items.length === 0 && (
        <EmptyState
          icon="ticket"
          title="No passes yet"
          action={<LinkButton to="/events">Browse events</LinkButton>}
        >
          Passes you buy for Garba nights appear here, with the code to show at the venue.
        </EmptyState>
      )}
      {items.length > 0 && (
        <ul className="space-y-3">
          {items.map((booking) => {
            const confirmed = booking.status === 'confirmed';
            return (
              <li key={booking.id}>
                <Link to={`/bookings/${booking.id}`} className="block rounded-card">
                  <Card padding="sm" interactive className="flex items-center gap-3">
                    <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-brand-50 text-brand-600">
                      <Icon name="ticket" className="size-6" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-semibold text-ink">
                        {booking.event.name}
                      </span>
                      <span className="block text-small text-muted">
                        {when(booking.event.startsAt)} · {booking.quantity} pass
                        {booking.quantity > 1 ? 'es' : ''}
                      </span>
                      <Badge tone={confirmed ? 'success' : 'neutral'} className="mt-1.5">
                        {bookingStatusText(booking)}
                      </Badge>
                    </span>
                    <Icon name="chevron-right" className="size-4 text-muted" />
                  </Card>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
      {list.hasNextPage && (
        <div className="flex justify-center">
          <Button
            variant="secondary"
            fullWidth={false}
            loading={list.isFetchingNextPage}
            onClick={() => void list.fetchNextPage()}
          >
            Load more
          </Button>
        </div>
      )}
    </div>
  );
}

/** Booking confirmation: the code to show at the venue, or the cancellation/refund status. */
export function BookingPage() {
  const { bookingId = '' } = useParams();
  const booking = useQuery({
    queryKey: ['bookings', bookingId],
    queryFn: () => fetchBooking(bookingId),
    // A pending refund updates through webhooks: refresh while it's in progress.
    refetchInterval: (query) => (query.state.data?.refundStatus === 'pending' ? 30_000 : false),
  });
  if (booking.isPending) {
    return (
      <LoadingRegion label="Loading your pass…" className="space-y-4">
        <h1 className="sr-only">Loading your pass</h1>
        <Skeleton className="h-6 w-28" />
        <Skeleton className="h-64 w-full rounded-card" />
      </LoadingRegion>
    );
  }
  if (booking.isError) {
    return (
      <EmptyState
        tone="error"
        title="We couldn't load this pass"
        action={<LinkButton to="/bookings">Back to my passes</LinkButton>}
      >
        <h1 className="sr-only">Pass not available</h1>
        {booking.error.message}
      </EmptyState>
    );
  }
  const b = booking.data;
  const confirmed = b.status === 'confirmed';

  return (
    <article className="mx-auto max-w-lg space-y-4">
      <Link to="/bookings" className={BACK_LINK}>
        <Icon name="arrow-left" className="size-4" />
        My passes
      </Link>

      {/* Drawn like a ticket: event on top, the code below a perforated line. */}
      <Card padding="none">
        <header className="bg-primary px-5 py-6 text-center text-white">
          <p className="text-label tracking-widest text-accent-yellow uppercase">
            {confirmed ? 'You’re going!' : 'Pass cancelled'}
          </p>
          <h1 className="mt-1 text-h2 text-white">{b.event.name}</h1>
          <p className="mt-1 text-small text-white/85">
            {when(b.event.startsAt)} · {b.event.venueName}
          </p>
        </header>
        <div className="border-t-2 border-dashed border-brand-200 px-5 py-6 text-center">
          <p className="text-caption font-semibold tracking-wide text-muted uppercase">
            Booking code
          </p>
          <p
            className={`mt-1 font-mono text-[2rem] leading-tight font-extrabold tracking-[0.18em] break-all ${
              confirmed ? 'text-primary' : 'text-muted line-through'
            }`}
            aria-label={`Booking code ${b.code}`}
          >
            {b.code}
          </p>
          <div className="mt-3 flex flex-wrap justify-center gap-2">
            <Badge
              tone={confirmed ? 'success' : 'danger'}
              {...(confirmed ? { icon: 'check' as const } : {})}
            >
              {bookingStatusText(b)}
            </Badge>
          </div>
          {confirmed && <p className="mt-3 text-small text-muted">Show this code at the venue.</p>}
        </div>
      </Card>

      {b.refundStatus !== 'none' && (
        <Alert tone={b.refundStatus === 'failed' ? 'warning' : 'info'}>
          {REFUND_LABELS[b.refundStatus]}
        </Alert>
      )}

      <Card>
        <dl className="divide-y divide-line text-small">
          {(
            [
              ['Passes', `${String(b.quantity)} · ${formatPaise(b.amountPaise)} paid`],
              ['When', when(b.event.startsAt)],
              ['Venue', b.event.venueName],
              ['Booked', when(b.createdAt)],
            ] as const
          ).map(([term, value]) => (
            <div key={term} className="flex justify-between gap-4 py-2.5">
              <dt className="shrink-0 text-muted">{term}</dt>
              <dd className="text-right font-medium text-ink">{value}</dd>
            </div>
          ))}
        </dl>
        <LinkButton to={`/events/${b.event.slug}`} variant="secondary" fullWidth className="mt-4">
          <Icon name="calendar" className="size-4.5" />
          View event
        </LinkButton>
      </Card>

      <p className="text-caption text-muted">
        Need to cancel? Contact support with your booking code. Refunds go back to the original
        payment method.
      </p>
    </article>
  );
}
