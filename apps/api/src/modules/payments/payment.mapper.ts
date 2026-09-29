import type { AdminPaymentDto, BookingDto, OrderDto, OrderEventDto } from '@garba-partner/shared';
import type { Event, EventBooking, Order, Payment } from '../../models/index.js';

function loaded<T>(value: T | undefined, what: string): T {
  if (!value) throw new Error(`${what} was not loaded`);
  return value;
}

export function toOrderEventDto(event: Event): OrderEventDto {
  return {
    id: event.id,
    slug: event.slug,
    name: event.name,
    venueName: event.venueName,
    startsAt: event.startsAt.toISOString(),
    endsAt: event.endsAt.toISOString(),
  };
}

/** `order.event` must be loaded. `lastFailed` = the newest failed payment attempt, if any. */
export function toOrderDto(
  order: Order,
  extra: { lastFailed: Payment | null; bookingId: string | null },
): OrderDto {
  return {
    id: order.id,
    status: order.status,
    event: toOrderEventDto(loaded(order.event, 'Order event')),
    quantity: order.quantity,
    unitPricePaise: order.unitPricePaise,
    amountPaise: order.amountPaise,
    currency: 'INR',
    expiresAt: order.expiresAt.toISOString(),
    paidAt: order.paidAt?.toISOString() ?? null,
    lastPaymentError: extra.lastFailed
      ? { code: extra.lastFailed.errorCode, description: extra.lastFailed.errorReason }
      : null,
    bookingId: extra.bookingId,
    createdAt: order.createdAt.toISOString(),
  };
}

/** `booking.event` must be loaded. */
export function toBookingDto(booking: EventBooking): BookingDto {
  return {
    id: booking.id,
    code: booking.code,
    status: booking.status,
    refundStatus: booking.refundStatus,
    cancelReason: booking.cancelReason,
    event: toOrderEventDto(loaded(booking.event, 'Booking event')),
    quantity: booking.quantity,
    amountPaise: booking.amountPaise,
    currency: 'INR',
    createdAt: booking.createdAt.toISOString(),
    cancelledAt: booking.cancelledAt?.toISOString() ?? null,
  };
}

export function toAdminPaymentDto(payment: Payment): AdminPaymentDto {
  return {
    id: payment.id,
    razorpayPaymentId: payment.razorpayPaymentId,
    status: payment.status,
    amountPaise: payment.amountPaise,
    method: payment.method,
    errorCode: payment.errorCode,
    errorReason: payment.errorReason,
    refundStatus: payment.refundStatus,
    razorpayRefundId: payment.razorpayRefundId,
    amountRefundedPaise: payment.amountRefundedPaise,
    capturedAt: payment.capturedAt?.toISOString() ?? null,
    createdAt: payment.createdAt.toISOString(),
  };
}
