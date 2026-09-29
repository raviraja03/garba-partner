import type {
  BookingCancelReason,
  BookingStatus,
  OrderStatus,
  PaymentStatus,
  RefundStatus,
} from '../../constants/enums.js';

/** Online pass sales for an event (public). `null` on the event when passes aren't sold here. */
export interface EventPassDto {
  pricePaise: number;
  currency: 'INR';
  maxPerOrder: number;
  /** Sales are open (published, not started). */
  onSale: boolean;
  /** Passes left, or null for unlimited. */
  remaining: number | null;
  soldOut: boolean;
}

export interface OrderEventDto {
  id: string;
  slug: string;
  name: string;
  venueName: string;
  startsAt: string;
  endsAt: string;
}

/** A member's order (`GET /api/v1/orders/:orderId`). */
export interface OrderDto {
  id: string;
  status: OrderStatus;
  event: OrderEventDto;
  quantity: number;
  unitPricePaise: number;
  amountPaise: number;
  currency: 'INR';
  expiresAt: string;
  paidAt: string | null;
  /** The latest failed attempt (Razorpay's customer-facing description), if any. */
  lastPaymentError: { code: string | null; description: string | null } | null;
  /** Set once the payment is verified and the booking exists. */
  bookingId: string | null;
  createdAt: string;
}

/** `POST /api/v1/orders`: the order plus what Razorpay Checkout needs (no secrets). */
export interface CreatedOrderDto {
  order: OrderDto;
  checkout: {
    /** Razorpay key ID (public). The key secret never leaves the server. */
    keyId: string;
    razorpayOrderId: string;
    amountPaise: number;
    currency: 'INR';
    name: string;
    description: string;
  };
}

/** A pass booking (`GET /api/v1/bookings/:bookingId`). */
export interface BookingDto {
  id: string;
  /** Shown at the venue, e.g. `GP-7K3M9QX2`. */
  code: string;
  status: BookingStatus;
  refundStatus: RefundStatus;
  cancelReason: BookingCancelReason | null;
  event: OrderEventDto;
  quantity: number;
  amountPaise: number;
  currency: 'INR';
  createdAt: string;
  cancelledAt: string | null;
}

/** `POST /api/v1/orders/:orderId/verify` */
export interface VerifyPaymentResultDto {
  order: OrderDto;
  booking: BookingDto | null;
}

// --- Admin ----------------------------------------------------------------------------------

/** Payment details for admins. Never card numbers, UPI IDs, emails or phone numbers. */
export interface AdminPaymentDto {
  id: string;
  razorpayPaymentId: string;
  status: PaymentStatus;
  amountPaise: number;
  method: string | null;
  errorCode: string | null;
  errorReason: string | null;
  refundStatus: RefundStatus;
  razorpayRefundId: string | null;
  amountRefundedPaise: number;
  capturedAt: string | null;
  createdAt: string;
}

export interface AdminOrderDto extends OrderDto {
  user: { id: string; name: string | null };
  razorpayOrderId: string | null;
  payments: AdminPaymentDto[];
}

export interface AdminBookingDto extends BookingDto {
  user: { id: string; name: string | null };
  orderId: string;
  payment: AdminPaymentDto | null;
}

/** Pass settings and sales on the admin event page. */
export interface AdminEventPassDto {
  pricePaise: number | null;
  capacity: number | null;
  /** Passes in confirmed bookings. */
  sold: number;
  /** Passes held by unpaid orders that haven't expired. */
  reserved: number;
}
