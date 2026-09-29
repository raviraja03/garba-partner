import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import { Link, useParams } from 'react-router';
import {
  BOOKING_STATUSES,
  ORDER_STATUSES,
  REFUND_STATUSES,
  type AdminBookingDto,
} from '@garba-partner/shared';
import { Alert } from '../components/ui/Alert';
import { Button } from '../components/ui/Button';
import { FILTER_CLASS } from '../components/ui/styles';
import { FullPageSpinner } from '../components/FullPageSpinner';
import { useHasPermission } from '../features/auth/auth-context';
import { formatPaise } from '../features/payments/format';
import {
  fetchAdminBooking,
  fetchAdminBookings,
  fetchAdminOrders,
  refundBooking,
  type BookingFilters,
  type OrderFilters,
} from '../features/payments/payments-api';
import { ReasonAction } from '../features/users/ReasonAction';
import { formatDateTime } from '../lib/format';

function Table({ head, children }: { head: string[]; children: ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-card bg-white shadow-sm ring-1 ring-black/5">
      <table className="w-full text-left text-sm">
        <thead className="border-b border-black/5 text-xs text-muted uppercase">
          <tr>
            {head.map((label) => (
              <th key={label} scope="col" className="px-4 py-3">
                {label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

function Bookings() {
  const [filters, setFilters] = useState<BookingFilters>({ status: '', refundStatus: '' });
  const list = useInfiniteQuery({
    queryKey: ['admin', 'payments', 'bookings', filters],
    queryFn: ({ pageParam }) => fetchAdminBookings(filters, pageParam),
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.nextCursor,
  });
  const rows = list.data?.pages.flatMap((p) => p.items) ?? [];
  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-lg font-bold">Bookings</h2>
        <label className="sr-only" htmlFor="booking-status">
          Status
        </label>
        <select
          id="booking-status"
          value={filters.status}
          onChange={(e) => {
            setFilters((f) => ({ ...f, status: e.target.value as BookingFilters['status'] }));
          }}
          className={FILTER_CLASS}
        >
          <option value="">All statuses</option>
          {BOOKING_STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <label className="sr-only" htmlFor="booking-refund">
          Refund
        </label>
        <select
          id="booking-refund"
          value={filters.refundStatus}
          onChange={(e) => {
            setFilters((f) => ({
              ...f,
              refundStatus: e.target.value as BookingFilters['refundStatus'],
            }));
          }}
          className={FILTER_CLASS}
        >
          <option value="">Any refund state</option>
          {REFUND_STATUSES.map((s) => (
            <option key={s} value={s}>
              refund: {s}
            </option>
          ))}
        </select>
      </div>
      {list.isError && <Alert tone="error">{list.error.message}</Alert>}
      <Table head={['Code', 'Event', 'Member', 'Passes', 'Amount', 'Status', 'Refund', 'Booked']}>
        {rows.map((b) => (
          <tr key={b.id} className="border-b border-black/5 last:border-0">
            <td className="px-4 py-3 font-mono">
              <Link to={`/payments/bookings/${b.id}`} className="font-semibold hover:underline">
                {b.code}
              </Link>
            </td>
            <td className="px-4 py-3">{b.event.name}</td>
            <td className="px-4 py-3">
              <Link to={`/users/${b.user.id}`} className="hover:underline">
                {b.user.name ?? b.user.id.slice(0, 8)}
              </Link>
            </td>
            <td className="px-4 py-3">{b.quantity}</td>
            <td className="px-4 py-3">{formatPaise(b.amountPaise)}</td>
            <td className="px-4 py-3">{b.status}</td>
            <td className="px-4 py-3">{b.refundStatus === 'none' ? '—' : b.refundStatus}</td>
            <td className="px-4 py-3 whitespace-nowrap">{formatDateTime(b.createdAt)}</td>
          </tr>
        ))}
      </Table>
      {list.hasNextPage && (
        <Button
          variant="secondary"
          className="w-auto! px-6"
          onClick={() => void list.fetchNextPage()}
        >
          Load more
        </Button>
      )}
    </section>
  );
}

function Orders() {
  const [filters, setFilters] = useState<OrderFilters>({ status: '' });
  const list = useInfiniteQuery({
    queryKey: ['admin', 'payments', 'orders', filters],
    queryFn: ({ pageParam }) => fetchAdminOrders(filters, pageParam),
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.nextCursor,
  });
  const rows = list.data?.pages.flatMap((p) => p.items) ?? [];
  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-lg font-bold">Orders</h2>
        <label className="sr-only" htmlFor="order-status">
          Status
        </label>
        <select
          id="order-status"
          value={filters.status}
          onChange={(e) => {
            setFilters({ status: e.target.value as OrderFilters['status'] });
          }}
          className={FILTER_CLASS}
        >
          <option value="">All statuses</option>
          {ORDER_STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </div>
      {list.isError && <Alert tone="error">{list.error.message}</Alert>}
      <Table
        head={['Created', 'Event', 'Member', 'Amount', 'Status', 'Payments', 'Razorpay order']}
      >
        {rows.map((o) => (
          <tr key={o.id} className="border-b border-black/5 align-top last:border-0">
            <td className="px-4 py-3 whitespace-nowrap">{formatDateTime(o.createdAt)}</td>
            <td className="px-4 py-3">{o.event.name}</td>
            <td className="px-4 py-3">{o.user.name ?? o.user.id.slice(0, 8)}</td>
            <td className="px-4 py-3">{formatPaise(o.amountPaise)}</td>
            <td className="px-4 py-3">
              {o.status}
              {o.bookingId && (
                <Link
                  to={`/payments/bookings/${o.bookingId}`}
                  className="ml-2 text-xs hover:underline"
                >
                  booking →
                </Link>
              )}
            </td>
            <td className="px-4 py-3 text-xs">
              {o.payments.length === 0
                ? '—'
                : o.payments
                    .map((p) => `${p.status}${p.errorReason ? ` (${p.errorReason})` : ''}`)
                    .join(', ')}
            </td>
            <td className="px-4 py-3 font-mono text-xs">{o.razorpayOrderId ?? '—'}</td>
          </tr>
        ))}
      </Table>
      {list.hasNextPage && (
        <Button
          variant="secondary"
          className="w-auto! px-6"
          onClick={() => void list.fetchNextPage()}
        >
          Load more
        </Button>
      )}
    </section>
  );
}

/** Payments back office: bookings and orders (`payments:view`). */
export function PaymentsPage() {
  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-extrabold">Payments</h1>
      <Bookings />
      <Orders />
      <p className="text-xs text-muted">
        Razorpay IDs, statuses and amounts only. Card, UPI and contact details stay with Razorpay.
      </p>
    </div>
  );
}

function Refund({ booking }: { booking: AdminBookingDto }) {
  const queryClient = useQueryClient();
  const refund = useMutation({
    mutationFn: (reason: string) => refundBooking(booking.id, reason),
    onSuccess: async (updated) => {
      queryClient.setQueryData(['admin', 'payments', 'booking', booking.id], updated);
      await queryClient.invalidateQueries({ queryKey: ['admin', 'payments', 'bookings'] });
    },
  });
  const refundable =
    booking.payment?.status === 'captured' &&
    (booking.refundStatus === 'none' || booking.refundStatus === 'failed');
  if (!refundable) return null;
  return (
    <ReasonAction
      label={
        booking.refundStatus === 'failed'
          ? 'Retry refund'
          : `Refund ${formatPaise(booking.amountPaise)}`
      }
      confirmLabel="Refund in full"
      hint="Cancels the booking and refunds the full amount to the original payment method. Audited."
      danger
      onConfirm={(reason) => refund.mutateAsync(reason)}
    />
  );
}

/** One booking with its payment and the refund action (`payments:refund`). */
export function PaymentBookingPage() {
  const { bookingId = '' } = useParams();
  const canRefund = useHasPermission('payments:refund');
  const booking = useQuery({
    queryKey: ['admin', 'payments', 'booking', bookingId],
    queryFn: () => fetchAdminBooking(bookingId),
  });
  if (booking.isPending) return <FullPageSpinner />;
  if (booking.isError) return <Alert tone="error">{booking.error.message}</Alert>;
  const b = booking.data;
  const rows: [string, string][] = [
    ['Code', b.code],
    ['Status', `${b.status}${b.cancelReason ? ` (${b.cancelReason})` : ''}`],
    ['Refund', b.refundStatus],
    ['Event', b.event.name],
    ['Member', b.user.name ?? b.user.id],
    ['Passes', String(b.quantity)],
    ['Amount', formatPaise(b.amountPaise)],
    ['Booked', formatDateTime(b.createdAt)],
    ['Cancelled', formatDateTime(b.cancelledAt)],
    ['Razorpay payment', b.payment?.razorpayPaymentId ?? '—'],
    [
      'Payment status',
      b.payment ? `${b.payment.status} (${b.payment.method ?? 'unknown method'})` : '—',
    ],
    ['Razorpay refund', b.payment?.razorpayRefundId ?? '—'],
    ['Refunded', b.payment ? formatPaise(b.payment.amountRefundedPaise) : '—'],
  ];
  return (
    <div className="max-w-3xl space-y-5">
      <Link to="/payments" className="text-sm font-semibold text-brand-700 hover:underline">
        ← Payments
      </Link>
      <h1 className="text-2xl font-extrabold">Booking {b.code}</h1>
      <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 rounded-card bg-white p-5 text-sm shadow-sm ring-1 ring-black/5">
        {rows.map(([label, value]) => (
          <div key={label} className="contents">
            <dt className="text-muted">{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
      {canRefund && <Refund booking={b} />}
    </div>
  );
}
