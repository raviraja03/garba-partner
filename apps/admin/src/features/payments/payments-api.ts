import type {
  AdminBookingDto,
  AdminEventDetailDto,
  AdminOrderDto,
  ApiSuccess,
  BookingStatus,
  EventPassSettingsInput,
  OrderStatus,
  PaginationMeta,
  RefundStatus,
} from '@garba-partner/shared';
import { api } from '../../lib/api-client';

export interface BookingFilters {
  status: BookingStatus | '';
  refundStatus: RefundStatus | '';
}

export interface OrderFilters {
  status: OrderStatus | '';
}

async function page<T>(path: string, params: URLSearchParams, cursor: string | null) {
  params.set('limit', '20');
  if (cursor) params.set('cursor', cursor);
  const envelope = await api<ApiSuccess<T[], PaginationMeta>>(`${path}?${params.toString()}`, {
    authenticated: true,
    envelope: true,
  });
  return { items: envelope.data, nextCursor: envelope.meta?.nextCursor ?? null };
}

export function fetchAdminBookings(filters: BookingFilters, cursor: string | null) {
  const params = new URLSearchParams();
  if (filters.status) params.set('status', filters.status);
  if (filters.refundStatus) params.set('refundStatus', filters.refundStatus);
  return page<AdminBookingDto>('/admin/payments/bookings', params, cursor);
}

export function fetchAdminOrders(filters: OrderFilters, cursor: string | null) {
  const params = new URLSearchParams();
  if (filters.status) params.set('status', filters.status);
  return page<AdminOrderDto>('/admin/payments/orders', params, cursor);
}

export const fetchAdminBooking = (bookingId: string) =>
  api<AdminBookingDto>(`/admin/payments/bookings/${bookingId}`, { authenticated: true });

/** Full refund (super admins, `payments:refund`). Audited server-side. */
export const refundBooking = (bookingId: string, reason: string) =>
  api<AdminBookingDto>(`/admin/payments/bookings/${bookingId}/refund`, {
    method: 'POST',
    body: { reason },
    authenticated: true,
  });

export const updateEventPass = (eventId: string, input: EventPassSettingsInput) =>
  api<AdminEventDetailDto>(`/admin/events/${eventId}/pass`, {
    method: 'PUT',
    body: input,
    authenticated: true,
  });
