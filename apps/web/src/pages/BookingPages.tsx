import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { Link, useParams } from 'react-router';
import { Alert } from '../components/ui/Alert';
import { Button } from '../components/ui/Button';
import { FullPageSpinner } from '../components/FullPageSpinner';
import { bookingStatusText, formatPaise, REFUND_LABELS } from '../features/passes/format';
import { fetchBooking, fetchBookings } from '../features/passes/passes-api';

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
  if (list.isPending) return <FullPageSpinner />;

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">My passes</h1>
      {list.isError && <Alert tone="error">{list.error.message}</Alert>}
      {items.length === 0 && (
        <Alert tone="info">
          No passes yet.{' '}
          <Link to="/events" className="font-semibold underline">
            Browse events
          </Link>
        </Alert>
      )}
      <ul className="space-y-2">
        {items.map((booking) => (
          <li key={booking.id}>
            <Link
              to={`/bookings/${booking.id}`}
              className="block rounded-card bg-white p-4 shadow-sm ring-1 ring-black/5 hover:bg-brand-50"
            >
              <p className="font-semibold">{booking.event.name}</p>
              <p className="text-sm text-muted">
                {when(booking.event.startsAt)} · {booking.quantity} pass
                {booking.quantity > 1 ? 'es' : ''} · {bookingStatusText(booking)}
              </p>
            </Link>
          </li>
        ))}
      </ul>
      {list.hasNextPage && (
        <Button
          variant="secondary"
          className="w-auto! px-6"
          loading={list.isFetchingNextPage}
          onClick={() => void list.fetchNextPage()}
        >
          Load more
        </Button>
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
  if (booking.isPending) return <FullPageSpinner />;
  if (booking.isError) return <Alert tone="error">{booking.error.message}</Alert>;
  const b = booking.data;
  const confirmed = b.status === 'confirmed';

  return (
    <article className="space-y-5">
      <Link to="/bookings" className="text-sm font-semibold text-brand-700 hover:underline">
        ← My passes
      </Link>
      <header
        className={`rounded-card p-5 text-center ring-1 ${
          confirmed ? 'bg-green-50 ring-green-200' : 'bg-black/5 ring-black/10'
        }`}
      >
        <p className="text-sm font-semibold">
          {confirmed ? 'You’re going! 🎉' : bookingStatusText(b)}
        </p>
        <p
          className="mt-2 font-mono text-3xl font-extrabold tracking-widest"
          aria-label="Booking code"
        >
          {b.code}
        </p>
        {confirmed && <p className="mt-1 text-xs text-muted">Show this code at the venue.</p>}
        {b.refundStatus !== 'none' && (
          <p className="mt-2 text-sm font-semibold">{REFUND_LABELS[b.refundStatus]}</p>
        )}
      </header>
      <dl className="grid gap-3 rounded-card bg-white p-5 shadow-sm ring-1 ring-black/5 sm:grid-cols-2">
        <div>
          <dt className="text-xs text-muted uppercase">Event</dt>
          <dd>
            <Link to={`/events/${b.event.slug}`} className="font-semibold hover:underline">
              {b.event.name}
            </Link>
          </dd>
        </div>
        <div>
          <dt className="text-xs text-muted uppercase">When</dt>
          <dd>{when(b.event.startsAt)}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted uppercase">Venue</dt>
          <dd>{b.event.venueName}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted uppercase">Passes</dt>
          <dd>
            {b.quantity} · {formatPaise(b.amountPaise)} paid
          </dd>
        </div>
        <div>
          <dt className="text-xs text-muted uppercase">Booked</dt>
          <dd>{when(b.createdAt)}</dd>
        </div>
      </dl>
      <p className="text-xs text-muted">
        Need to cancel? Contact support with your booking code. Refunds go back to the original
        payment method.
      </p>
    </article>
  );
}
