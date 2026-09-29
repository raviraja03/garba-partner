import type {
  ApiSuccess,
  BookingDto,
  CreatedOrderDto,
  OrderDto,
  PaginationMeta,
  VerifyPaymentInput,
  VerifyPaymentResultDto,
} from '@garba-partner/shared';
import { api } from '../../lib/api-client';

/**
 * Starts a checkout. The same `idempotencyKey` always returns the same order (safe to retry
 * after a network error). The server computes the amount; the client only sends a quantity.
 */
export const createPassOrder = (eventId: string, quantity: number, idempotencyKey: string) =>
  api<CreatedOrderDto>('/orders', {
    method: 'POST',
    body: { eventId, quantity },
    headers: { 'Idempotency-Key': idempotencyKey },
    authenticated: true,
  });

export const fetchOrder = (orderId: string) =>
  api<OrderDto>(`/orders/${orderId}`, { authenticated: true });

/** Sends Razorpay Checkout's result for server-side verification (signature + Razorpay API). */
export const verifyPassPayment = (orderId: string, input: VerifyPaymentInput) =>
  api<VerifyPaymentResultDto>(`/orders/${orderId}/verify`, {
    method: 'POST',
    body: input,
    authenticated: true,
  });

export async function fetchBookings(cursor: string | null) {
  const params = new URLSearchParams();
  if (cursor) params.set('cursor', cursor);
  const envelope = await api<ApiSuccess<BookingDto[], PaginationMeta>>(
    `/bookings?${params.toString()}`,
    { authenticated: true, envelope: true },
  );
  return { items: envelope.data, nextCursor: envelope.meta?.nextCursor ?? null };
}

export const fetchBooking = (bookingId: string) =>
  api<BookingDto>(`/bookings/${bookingId}`, { authenticated: true });
