import type { MigrationFn } from 'umzug';
import type { MigrationContext } from '../config/umzug.js';
import { runInTransaction, updatedAtTrigger } from '../lib/migration-helpers.js';

const inList = (values: readonly string[]) => values.map((value) => `'${value}'`).join(', ');

const AUDIT_TARGETS_BEFORE = [
  'user',
  'admin',
  'report',
  'event',
  'verification',
  'photo',
  'city',
  'area',
  'sanction',
  'organizer',
  'match',
];
const NOTIFICATION_TYPES_BEFORE = [
  'interest_received',
  'interest_accepted',
  'match_created',
  'new_message',
  'verification_completed',
  'event_reminder',
  'safety',
];

/**
 * Event pass purchase with Razorpay (docs/payments/payment-flow.md).
 *
 * - `events.pass_price_paise` / `pass_capacity`: passes sold on the platform (NULL price = not sold).
 * - `orders`: one checkout attempt; the amount is computed by the server (quantity × unit price,
 *   enforced by a CHECK). `UNIQUE (user_id, idempotency_key)` makes order creation idempotent.
 * - `payments`: Razorpay payments as VERIFIED by the server (`UNIQUE razorpay_payment_id`), with
 *   refund status. No card numbers, UPI IDs, emails or phone numbers are stored.
 * - `event_bookings`: at most one per order (`UNIQUE order_id`) and per payment.
 * - `payment_webhook_events`: Razorpay event IDs already handled (webhook idempotency).
 * Financial rows use `ON DELETE RESTRICT`: they are never deleted with a user or event.
 */
export const up: MigrationFn<MigrationContext> = async ({ context: { sequelize } }) => {
  await runInTransaction(sequelize, [
    `ALTER TABLE events
       ADD COLUMN pass_price_paise integer,
       ADD COLUMN pass_capacity integer,
       ADD CONSTRAINT events_pass_price_check
         CHECK (pass_price_paise IS NULL OR pass_price_paise BETWEEN 100 AND 1000000),
       ADD CONSTRAINT events_pass_capacity_check
         CHECK (pass_capacity IS NULL OR pass_capacity BETWEEN 1 AND 100000)`,

    `CREATE TABLE orders (
       id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
       user_id            uuid NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
       event_id           uuid NOT NULL REFERENCES events (id) ON DELETE RESTRICT,
       idempotency_key    uuid NOT NULL,
       quantity           smallint NOT NULL,
       unit_price_paise   integer NOT NULL,
       amount_paise       integer NOT NULL,
       currency           char(3) NOT NULL DEFAULT 'INR',
       status             varchar(20) NOT NULL DEFAULT 'created',
       razorpay_order_id  varchar(40),
       expires_at         timestamptz NOT NULL,
       paid_at            timestamptz,
       created_at         timestamptz NOT NULL DEFAULT now(),
       updated_at         timestamptz NOT NULL DEFAULT now(),

       CONSTRAINT orders_status_check CHECK (status IN ('created', 'paid', 'expired', 'failed')),
       CONSTRAINT orders_quantity_check CHECK (quantity BETWEEN 1 AND 6),
       CONSTRAINT orders_unit_price_check CHECK (unit_price_paise > 0),
       CONSTRAINT orders_amount_check CHECK (amount_paise = unit_price_paise * quantity),
       CONSTRAINT orders_currency_check CHECK (currency = 'INR'),
       CONSTRAINT orders_paid_check CHECK ((status = 'paid') = (paid_at IS NOT NULL)),
       CONSTRAINT orders_idempotency_unique UNIQUE (user_id, idempotency_key),
       CONSTRAINT orders_razorpay_order_id_unique UNIQUE (razorpay_order_id)
     )`,
    `CREATE INDEX orders_user_created_idx ON orders (user_id, created_at DESC, id DESC)`,
    // Capacity: unpaid orders still holding seats.
    `CREATE INDEX orders_event_open_idx ON orders (event_id, expires_at) WHERE status = 'created'`,
    // Expiry / reconciliation job.
    `CREATE INDEX orders_open_expiry_idx ON orders (expires_at) WHERE status = 'created'`,
    `CREATE INDEX orders_status_created_idx ON orders (status, created_at DESC, id DESC)`,
    updatedAtTrigger('orders'),

    `CREATE TABLE payments (
       id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
       order_id               uuid NOT NULL REFERENCES orders (id) ON DELETE RESTRICT,
       razorpay_payment_id    varchar(40) NOT NULL,
       status                 varchar(20) NOT NULL,
       amount_paise           integer NOT NULL,
       currency               char(3) NOT NULL,
       method                 varchar(20),
       error_code             varchar(60),
       error_reason           varchar(255),
       captured_at            timestamptz,
       refund_status          varchar(20) NOT NULL DEFAULT 'none',
       razorpay_refund_id     varchar(40),
       amount_refunded_paise  integer NOT NULL DEFAULT 0,
       refunded_at            timestamptz,
       created_at             timestamptz NOT NULL DEFAULT now(),
       updated_at             timestamptz NOT NULL DEFAULT now(),

       CONSTRAINT payments_status_check
         CHECK (status IN ('created', 'authorized', 'captured', 'failed', 'refunded')),
       CONSTRAINT payments_refund_status_check
         CHECK (refund_status IN ('none', 'pending', 'processed', 'failed')),
       CONSTRAINT payments_amount_check CHECK (amount_paise > 0),
       CONSTRAINT payments_refunded_amount_check
         CHECK (amount_refunded_paise BETWEEN 0 AND amount_paise),
       CONSTRAINT payments_razorpay_payment_id_unique UNIQUE (razorpay_payment_id),
       CONSTRAINT payments_razorpay_refund_id_unique UNIQUE (razorpay_refund_id)
     )`,
    `CREATE INDEX payments_order_id_idx ON payments (order_id, created_at DESC)`,
    `CREATE INDEX payments_refund_pending_idx ON payments (updated_at) WHERE refund_status = 'pending'`,
    updatedAtTrigger('payments'),

    `CREATE TABLE event_bookings (
       id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
       code           varchar(16) NOT NULL,
       order_id       uuid NOT NULL REFERENCES orders (id) ON DELETE RESTRICT,
       payment_id     uuid NOT NULL REFERENCES payments (id) ON DELETE RESTRICT,
       user_id        uuid NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
       event_id       uuid NOT NULL REFERENCES events (id) ON DELETE RESTRICT,
       quantity       smallint NOT NULL,
       amount_paise   integer NOT NULL,
       status         varchar(20) NOT NULL DEFAULT 'confirmed',
       refund_status  varchar(20) NOT NULL DEFAULT 'none',
       cancel_reason  varchar(30),
       cancelled_at   timestamptz,
       created_at     timestamptz NOT NULL DEFAULT now(),
       updated_at     timestamptz NOT NULL DEFAULT now(),

       CONSTRAINT event_bookings_status_check CHECK (status IN ('confirmed', 'cancelled')),
       CONSTRAINT event_bookings_refund_status_check
         CHECK (refund_status IN ('none', 'pending', 'processed', 'failed')),
       CONSTRAINT event_bookings_cancel_reason_check
         CHECK (cancel_reason IS NULL OR cancel_reason IN ('admin_refund', 'sold_out', 'event_unavailable')),
       CONSTRAINT event_bookings_cancel_consistency_check
         CHECK ((status = 'cancelled') = (cancelled_at IS NOT NULL AND cancel_reason IS NOT NULL)),
       CONSTRAINT event_bookings_quantity_check CHECK (quantity BETWEEN 1 AND 6),
       CONSTRAINT event_bookings_code_unique UNIQUE (code),
       CONSTRAINT event_bookings_order_unique UNIQUE (order_id),
       CONSTRAINT event_bookings_payment_unique UNIQUE (payment_id)
     )`,
    `CREATE INDEX event_bookings_user_created_idx ON event_bookings (user_id, created_at DESC, id DESC)`,
    // Capacity: confirmed passes per event.
    `CREATE INDEX event_bookings_event_confirmed_idx ON event_bookings (event_id) WHERE status = 'confirmed'`,
    `CREATE INDEX event_bookings_status_created_idx ON event_bookings (status, created_at DESC, id DESC)`,
    updatedAtTrigger('event_bookings'),

    `CREATE TABLE payment_webhook_events (
       event_id             varchar(64) PRIMARY KEY,
       event                varchar(60) NOT NULL,
       razorpay_payment_id  varchar(40),
       razorpay_order_id    varchar(40),
       received_at          timestamptz NOT NULL DEFAULT now(),
       processed_at         timestamptz
     )`,
    `CREATE INDEX payment_webhook_events_received_idx ON payment_webhook_events (received_at)`,

    // Booking notifications (always on).
    `ALTER TABLE notifications ADD COLUMN booking_id uuid REFERENCES event_bookings (id) ON DELETE CASCADE`,
    `ALTER TABLE notifications DROP CONSTRAINT notifications_type_check`,
    `ALTER TABLE notifications ADD CONSTRAINT notifications_type_check
       CHECK (type IN (${inList([...NOTIFICATION_TYPES_BEFORE, 'booking'])}))`,
    `ALTER TABLE notifications ADD CONSTRAINT notifications_booking_required_check
       CHECK (type <> 'booking' OR booking_id IS NOT NULL)`,

    // Refunds are audited against the booking.
    `ALTER TABLE admin_audit_logs DROP CONSTRAINT admin_audit_logs_target_type_check`,
    `ALTER TABLE admin_audit_logs ADD CONSTRAINT admin_audit_logs_target_type_check
       CHECK (target_type IN (${inList([...AUDIT_TARGETS_BEFORE, 'booking'])}))`,
  ]);
};

export const down: MigrationFn<MigrationContext> = async ({ context: { sequelize } }) => {
  await runInTransaction(sequelize, [
    // Audit entries are append-only: existing 'booking' rows are kept (NOT VALID skips them).
    `ALTER TABLE admin_audit_logs DROP CONSTRAINT admin_audit_logs_target_type_check`,
    `ALTER TABLE admin_audit_logs ADD CONSTRAINT admin_audit_logs_target_type_check
       CHECK (target_type IN (${inList(AUDIT_TARGETS_BEFORE)})) NOT VALID`,
    `DELETE FROM notifications WHERE type = 'booking'`,
    `ALTER TABLE notifications DROP CONSTRAINT notifications_booking_required_check`,
    `ALTER TABLE notifications DROP CONSTRAINT notifications_type_check`,
    `ALTER TABLE notifications ADD CONSTRAINT notifications_type_check
       CHECK (type IN (${inList(NOTIFICATION_TYPES_BEFORE)}))`,
    `ALTER TABLE notifications DROP COLUMN booking_id`,
    `DROP TABLE IF EXISTS payment_webhook_events`,
    `DROP TABLE IF EXISTS event_bookings`,
    `DROP TABLE IF EXISTS payments`,
    `DROP TABLE IF EXISTS orders`,
    `ALTER TABLE events
       DROP CONSTRAINT IF EXISTS events_pass_capacity_check,
       DROP CONSTRAINT IF EXISTS events_pass_price_check,
       DROP COLUMN IF EXISTS pass_capacity,
       DROP COLUMN IF EXISTS pass_price_paise`,
  ]);
};
