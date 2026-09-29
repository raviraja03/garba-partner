import * as z from 'zod/mini';
import { BOOKING_STATUSES, ORDER_STATUSES, REFUND_STATUSES } from '../constants/enums.js';
import { LIMITS } from '../constants/limits.js';

const cursor = z.optional(z.string().check(z.maxLength(300)));
const limit = z.optional(
  z.pipe(
    z.string().check(z.regex(/^\d{1,3}$/, 'limit must be a number')),
    z.transform((value) => Math.min(Math.max(Number(value), 1), LIMITS.ADMIN_PAGE_SIZE_MAX)),
  ),
);

/**
 * `POST /api/v1/orders`. The amount is NEVER taken from the client: the server computes it from
 * the event's pass price. Requires an `Idempotency-Key` header (UUID).
 */
export const createOrderSchema = z.strictObject({
  eventId: z.uuid('Invalid event.'),
  quantity: z
    .int('Choose how many passes.')
    .check(
      z.minimum(1, 'Choose at least one pass.'),
      z.maximum(
        LIMITS.PASS_MAX_PER_ORDER,
        `You can buy up to ${String(LIMITS.PASS_MAX_PER_ORDER)} passes per order.`,
      ),
    ),
});
export type CreateOrderInput = z.input<typeof createOrderSchema>;

/** The `Idempotency-Key` header of `POST /api/v1/orders`. */
export const idempotencyKeySchema = z.uuid('Send a UUID in the Idempotency-Key header.');

/**
 * `POST /api/v1/orders/:orderId/verify`: what Razorpay Checkout returns to the browser. The
 * server checks the signature AND re-reads the payment from Razorpay; nothing here is trusted
 * on its own.
 */
export const verifyPaymentSchema = z.strictObject({
  razorpayOrderId: z.string().check(z.regex(/^order_[A-Za-z0-9]{6,40}$/, 'Invalid order.')),
  razorpayPaymentId: z.string().check(z.regex(/^pay_[A-Za-z0-9]{6,40}$/, 'Invalid payment.')),
  razorpaySignature: z.string().check(z.regex(/^[0-9a-f]{64}$/, 'Invalid signature.')),
});
export type VerifyPaymentInput = z.input<typeof verifyPaymentSchema>;

/** `GET /api/v1/bookings` */
export const bookingListQuerySchema = z.strictObject({ cursor, limit });
export type BookingListQueryData = z.output<typeof bookingListQuerySchema>;

// --- Admin ----------------------------------------------------------------------------------

/**
 * `PUT /api/v1/admin/events/:eventId/pass`: `pricePaise: null` stops online sales; `capacity:
 * null` means unlimited. Existing orders keep the price they were created with.
 */
export const eventPassSettingsSchema = z.strictObject({
  pricePaise: z.nullable(
    z
      .int('Price must be a whole number of paise.')
      .check(
        z.minimum(LIMITS.PASS_PRICE_MIN_PAISE, 'Price must be at least ₹1.'),
        z.maximum(LIMITS.PASS_PRICE_MAX_PAISE, 'Price must be at most ₹10,000.'),
      ),
  ),
  capacity: z.nullable(
    z
      .int('Capacity must be a whole number.')
      .check(z.minimum(1), z.maximum(LIMITS.PASS_CAPACITY_MAX)),
  ),
});
export type EventPassSettingsInput = z.input<typeof eventPassSettingsSchema>;

/** `POST /api/v1/admin/payments/bookings/:bookingId/refund` (full refund). */
export const adminRefundSchema = z.strictObject({
  reason: z
    .string()
    .check(
      z.trim(),
      z.minLength(
        LIMITS.ADMIN_ACTION_REASON_MIN,
        `Reason must be at least ${String(LIMITS.ADMIN_ACTION_REASON_MIN)} characters.`,
      ),
      z.maxLength(LIMITS.ADMIN_ACTION_REASON_MAX),
    ),
});
export type AdminRefundInput = z.input<typeof adminRefundSchema>;

/** `GET /api/v1/admin/payments/orders` */
export const adminOrderListQuerySchema = z.strictObject({
  status: z.optional(z.enum(ORDER_STATUSES)),
  eventId: z.optional(z.uuid()),
  cursor,
  limit,
});
export type AdminOrderListQueryData = z.output<typeof adminOrderListQuerySchema>;

/** `GET /api/v1/admin/payments/bookings` */
export const adminBookingListQuerySchema = z.strictObject({
  status: z.optional(z.enum(BOOKING_STATUSES)),
  refundStatus: z.optional(z.enum(REFUND_STATUSES)),
  eventId: z.optional(z.uuid()),
  cursor,
  limit,
});
export type AdminBookingListQueryData = z.output<typeof adminBookingListQuerySchema>;
