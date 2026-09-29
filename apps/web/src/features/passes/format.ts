import type { BookingDto, RefundStatus } from '@garba-partner/shared';

const RUPEES = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 2,
  minimumFractionDigits: 0,
});

/** 49900 → "₹499". */
export function formatPaise(paise: number): string {
  return RUPEES.format(paise / 100);
}

export const REFUND_LABELS: Record<RefundStatus, string> = {
  none: '',
  pending: 'Refund in progress (usually 5–7 working days)',
  processed: 'Refunded',
  failed: 'Refund delayed: our team will retry',
};

export function bookingStatusText(booking: BookingDto): string {
  if (booking.status === 'confirmed') return 'Confirmed';
  if (booking.cancelReason === 'sold_out')
    return 'Cancelled: passes sold out before payment arrived';
  if (booking.cancelReason === 'event_unavailable')
    return 'Cancelled: the event is no longer available';
  return 'Cancelled';
}
