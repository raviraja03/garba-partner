import { createHash, randomInt } from 'node:crypto';
import type { IncomingHttpHeaders } from 'node:http';
import { Op, UniqueConstraintError, type Transaction, type WhereOptions } from 'sequelize';
import type { Sequelize } from 'sequelize-typescript';
import type { Logger } from 'pino';
import type { ServerEnv } from '@garba-partner/config/server';
import {
  LIMITS,
  type BookingDto,
  type BookingListQueryData,
  type BookingNotificationKind,
  type CreatedOrderDto,
  type OrderDto,
  type PaginationMeta,
  type PaymentStatus,
  type RefundStatus,
  type VerifyPaymentResultDto,
} from '@garba-partner/shared';
import { AppError } from '../../lib/app-error.js';
import { decodeCursor, encodeCursor } from '../../lib/pagination.js';
import { Event, EventBooking, Order, Payment, PaymentWebhookEvent } from '../../models/index.js';
import type {
  PaymentGateway,
  RazorpayPayment,
  RazorpayRefund,
} from '../../providers/payments/razorpay.gateway.js';
import { recordAdminAction } from '../admin/audit/audit.service.js';
import type { Notifier } from '../notifications/notifications.service.js';
import { passesOnSale, seatCounts } from './pass-availability.js';
import { toBookingDto, toOrderDto } from './payment.mapper.js';

const MINUTE_MS = 60 * 1000;
const BOOKING_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const WEBHOOK_PAYMENT_EVENTS = new Set([
  'payment.authorized',
  'payment.captured',
  'payment.failed',
  'order.paid',
]);
const WEBHOOK_REFUND_EVENTS = new Set(['refund.created', 'refund.processed', 'refund.failed']);

export interface PaymentActor {
  adminId: string;
  ip: string;
}

export interface PaymentsService {
  createOrder(
    userId: string,
    input: { eventId: string; quantity: number },
    idempotencyKey: string,
  ): Promise<{ result: CreatedOrderDto; created: boolean }>;
  getOrder(userId: string, orderId: string): Promise<OrderDto>;
  verify(
    userId: string,
    orderId: string,
    input: { razorpayOrderId: string; razorpayPaymentId: string; razorpaySignature: string },
  ): Promise<VerifyPaymentResultDto>;
  listBookings(
    userId: string,
    query: BookingListQueryData,
  ): Promise<{ items: BookingDto[]; meta: PaginationMeta }>;
  getBooking(userId: string, bookingId: string): Promise<BookingDto>;
  /** Razorpay webhook. Verifies the signature over the RAW body and de-duplicates by event ID. */
  handleWebhook(rawBody: Buffer, headers: IncomingHttpHeaders): Promise<{ duplicate: boolean }>;
  /** Admin full refund of a booking (or a retry after a failed refund). Audited. */
  refundBooking(actor: PaymentActor, bookingId: string, reason: string): Promise<void>;
  /**
   * Job: finalizes payments of lapsed orders that Razorpay reports (missed webhooks), then
   * marks the orders expired, releasing their seats.
   */
  expireOrders(now?: Date): Promise<{ expired: number; reconciled: number }>;
}

type FinalizeOutcome =
  | { kind: 'ignored' }
  | { kind: 'recorded'; payment: Payment }
  | { kind: 'booked'; booking: EventBooking; payment: Payment; refund: boolean }
  | { kind: 'already'; booking: EventBooking }
  | { kind: 'refund_duplicate'; payment: Payment };

function bookingCode(): string {
  let code = '';
  for (let i = 0; i < 8; i += 1)
    code += BOOKING_CODE_ALPHABET[randomInt(BOOKING_CODE_ALPHABET.length)];
  return `GP-${code}`;
}

/** Razorpay's customer-facing text only, trimmed. Never card or UPI details. */
function errorText(value: string | null | undefined, max: number): string | null {
  return value ? value.slice(0, max) : null;
}

function header(headers: IncomingHttpHeaders, name: string): string | undefined {
  const value = headers[name];
  return typeof value === 'string' ? value : undefined;
}

/**
 * Event pass purchase (docs/payments/payment-flow.md). The client's view of a payment is never
 * trusted: a booking exists only after the server has verified a CAPTURED payment for the exact
 * order amount, from a signed webhook or from Razorpay's API. Every state change happens in a
 * database transaction that locks the event (capacity) and the order (idempotency).
 */
export function createPaymentsService(deps: {
  sequelize: Sequelize;
  env: ServerEnv;
  gateway: PaymentGateway | null;
  notifier: Notifier;
  logger: Logger;
}): PaymentsService {
  const { sequelize, env, notifier, logger } = deps;

  function requireGateway(): PaymentGateway {
    if (!deps.gateway) throw new AppError('PAYMENTS_UNAVAILABLE');
    return deps.gateway;
  }

  async function orderView(order: Order): Promise<OrderDto> {
    const [event, lastFailed, booking] = await Promise.all([
      order.event ? Promise.resolve(order.event) : Event.findByPk(order.eventId),
      Payment.findOne({
        where: { orderId: order.id, status: 'failed' },
        order: [['createdAt', 'DESC']],
      }),
      EventBooking.findOne({ where: { orderId: order.id }, attributes: ['id'] }),
    ]);
    if (event) order.event = event;
    return toOrderDto(order, { lastFailed, bookingId: booking?.id ?? null });
  }

  async function bookingView(bookingId: string): Promise<BookingDto> {
    const booking = await EventBooking.findByPk(bookingId, {
      include: [{ model: Event, as: 'event' }],
    });
    if (!booking) throw new AppError('NOT_FOUND', { message: 'Booking not found.' });
    return toBookingDto(booking);
  }

  async function notifyBooking(booking: EventBooking, kind: BookingNotificationKind) {
    await notifier.notify({
      userId: booking.userId,
      type: 'booking',
      bookingId: booking.id,
      eventId: booking.eventId,
      data: { bookingKind: kind },
    });
  }

  /** Attaches a Razorpay order to a local order (or marks the local order failed). */
  async function attachRazorpayOrder(order: Order, event: Event): Promise<void> {
    const gateway = requireGateway();
    try {
      const remote = await gateway.createOrder({
        amountPaise: order.amountPaise,
        currency: 'INR',
        receipt: order.id,
        notes: { orderId: order.id, eventId: event.id },
      });
      if (remote.amount !== order.amountPaise || remote.currency !== 'INR') {
        logger.error({ orderId: order.id }, 'Razorpay order amount mismatch');
        throw new AppError('PAYMENT_PROVIDER_ERROR');
      }
      await order.update({ razorpayOrderId: remote.id });
    } catch (err) {
      await order.update({ status: 'failed' });
      throw err;
    }
  }

  /**
   * The single place where a Razorpay payment changes our state. Safe to run any number of
   * times, concurrently, from checkout verification, webhooks or the reconciliation job.
   */
  async function finalize(remote: RazorpayPayment): Promise<FinalizeOutcome> {
    if (!remote.order_id) return { kind: 'ignored' };
    const order = await Order.findOne({ where: { razorpayOrderId: remote.order_id } });
    if (!order) {
      logger.warn({ razorpayOrderId: remote.order_id }, 'Payment for an unknown order');
      return { kind: 'ignored' };
    }
    const matchesOrder = remote.amount === order.amountPaise && remote.currency === 'INR';

    // Authorized but not captured: capture it ourselves, for OUR amount.
    let payment = remote;
    if (payment.status === 'authorized' && matchesOrder) {
      try {
        payment = await requireGateway().capturePayment(payment.id, order.amountPaise, 'INR');
      } catch {
        // Maybe captured concurrently (auto-capture or another worker): re-read the truth.
        payment = await requireGateway().fetchPayment(payment.id);
      }
    }

    const outcome = await sequelize.transaction(async (transaction): Promise<FinalizeOutcome> => {
      // Lock order: event (capacity), then order (state). Same order everywhere.
      const event = await Event.findByPk(order.eventId, {
        lock: transaction.LOCK.UPDATE,
        transaction,
      });
      const locked = await Order.findByPk(order.id, { lock: transaction.LOCK.UPDATE, transaction });
      if (!event || !locked) return { kind: 'ignored' };

      const status: PaymentStatus = payment.status === 'refunded' ? 'refunded' : payment.status;
      const now = new Date();
      let row = await Payment.findOne({
        where: { razorpayPaymentId: payment.id },
        lock: transaction.LOCK.UPDATE,
        transaction,
      });
      const fields = {
        status,
        amountPaise: payment.amount,
        currency: payment.currency,
        method: errorText(payment.method, 20),
        errorCode: errorText(payment.error_code, 60),
        errorReason: errorText(payment.error_description, 255),
      };
      if (row) {
        // Never move a captured payment backwards (webhooks can arrive out of order).
        if (!(row.status === 'captured' && (status === 'authorized' || status === 'failed'))) {
          await row.update(
            {
              ...fields,
              capturedAt: status === 'captured' ? (row.capturedAt ?? now) : row.capturedAt,
            },
            { transaction },
          );
        }
      } else {
        row = await Payment.create(
          {
            orderId: locked.id,
            razorpayPaymentId: payment.id,
            ...fields,
            capturedAt: status === 'captured' ? now : null,
          },
          { transaction },
        );
      }
      if (row.status !== 'captured') return { kind: 'recorded', payment: row };

      const existing = await EventBooking.findOne({ where: { orderId: locked.id }, transaction });
      if (existing) {
        if (existing.paymentId === row.id) return { kind: 'already', booking: existing };
        // A second captured payment for an already-paid order: refund it in full.
        if (row.refundStatus === 'none') {
          await row.update({ refundStatus: 'pending' }, { transaction });
          return { kind: 'refund_duplicate', payment: row };
        }
        return { kind: 'already', booking: existing };
      }
      if (!matchesOrder) {
        // Razorpay enforces the order amount, so this should never happen; refund if it does.
        logger.error({ orderId: locked.id }, 'Captured amount does not match the order');
        if (row.refundStatus === 'none')
          await row.update({ refundStatus: 'pending' }, { transaction });
        return { kind: 'refund_duplicate', payment: row };
      }

      // Can we honour it? A live reservation always can; a lapsed one needs free seats.
      let cancelReason: 'sold_out' | 'event_unavailable' | null = null;
      if (event.status !== 'published' || event.endsAt <= now) {
        cancelReason = 'event_unavailable';
      } else if (
        (locked.status !== 'created' || locked.expiresAt <= now) &&
        event.passCapacity !== null
      ) {
        const { sold, reserved } = await seatCounts(sequelize, event.id, {
          now,
          excludeOrderId: locked.id,
          transaction,
        });
        if (sold + reserved + locked.quantity > event.passCapacity) cancelReason = 'sold_out';
      }

      const booking = await EventBooking.create(
        {
          code: bookingCode(),
          orderId: locked.id,
          paymentId: row.id,
          userId: locked.userId,
          eventId: locked.eventId,
          quantity: locked.quantity,
          amountPaise: locked.amountPaise,
          status: cancelReason ? 'cancelled' : 'confirmed',
          refundStatus: cancelReason ? 'pending' : 'none',
          cancelReason,
          cancelledAt: cancelReason ? now : null,
        },
        { transaction },
      );
      if (cancelReason) await row.update({ refundStatus: 'pending' }, { transaction });
      await locked.update({ status: 'paid', paidAt: now }, { transaction });
      return { kind: 'booked', booking, payment: row, refund: cancelReason !== null };
    });

    // After commit: automatic refunds and notifications (never inside the transaction).
    if (outcome.kind === 'booked') {
      if (outcome.refund) {
        await notifyBooking(outcome.booking, 'cancelled');
        await startRefund(outcome.payment, outcome.booking);
      } else {
        await notifyBooking(outcome.booking, 'confirmed');
      }
    } else if (outcome.kind === 'refund_duplicate') {
      await startRefund(outcome.payment, null);
    }
    return outcome;
  }

  function refundStatusOf(refund: RazorpayRefund): RefundStatus {
    return refund.status === 'processed'
      ? 'processed'
      : refund.status === 'failed'
        ? 'failed'
        : 'pending';
  }

  /** Records a refund result on the payment and its booking. */
  async function applyRefund(
    payment: Payment,
    refund: { id: string | null; amount: number; status: RefundStatus },
    transaction?: Transaction,
  ): Promise<EventBooking | null> {
    const options = transaction ? { transaction } : {};
    const processed = refund.status === 'processed';
    await payment.update(
      {
        refundStatus: refund.status,
        razorpayRefundId: refund.id ?? payment.razorpayRefundId,
        ...(processed
          ? {
              status: 'refunded' as const,
              amountRefundedPaise: Math.min(payment.amountPaise, refund.amount),
              refundedAt: payment.refundedAt ?? new Date(),
            }
          : {}),
      },
      options,
    );
    const booking = await EventBooking.findOne({ where: { paymentId: payment.id }, ...options });
    if (booking) await booking.update({ refundStatus: refund.status }, options);
    return booking;
  }

  /** Calls Razorpay's refund API for the remaining amount. Failures are recorded, not thrown. */
  async function startRefund(payment: Payment, booking: EventBooking | null): Promise<void> {
    const amount = payment.amountPaise - payment.amountRefundedPaise;
    try {
      const refund = await requireGateway().refundPayment(payment.razorpayPaymentId, {
        amountPaise: amount,
        receipt: `refund_${(booking?.id ?? payment.id).slice(0, 30)}`,
        notes: { paymentId: payment.id, ...(booking ? { bookingId: booking.id } : {}) },
      });
      const updated = await applyRefund(payment, {
        id: refund.id,
        amount: refund.amount,
        status: refundStatusOf(refund),
      });
      if (updated && refund.status === 'processed')
        await notifyBooking(updated, 'refund_processed');
    } catch (err) {
      logger.error({ err, paymentId: payment.id }, 'Refund could not be started');
      const updated = await applyRefund(payment, { id: null, amount: 0, status: 'failed' });
      if (updated) await notifyBooking(updated, 'refund_failed');
    }
  }

  async function onRefundWebhook(refund: RazorpayRefund): Promise<void> {
    const payment = await Payment.findOne({ where: { razorpayPaymentId: refund.payment_id } });
    if (!payment) {
      logger.warn({ razorpayRefundId: refund.id }, 'Refund for an unknown payment');
      return;
    }
    const status = refundStatusOf(refund);
    // A final state is never overwritten by a late "created"/pending event.
    if (
      payment.refundStatus === 'processed' ||
      (payment.refundStatus === 'failed' && status === 'pending')
    )
      return;
    const booking = await applyRefund(payment, { id: refund.id, amount: refund.amount, status });
    if (booking && status === 'processed') await notifyBooking(booking, 'refund_processed');
    if (booking && status === 'failed') await notifyBooking(booking, 'refund_failed');
  }

  return {
    async createOrder(userId, input, idempotencyKey) {
      requireGateway();
      const existing = await Order.findOne({ where: { userId, idempotencyKey } });
      let order = existing;
      let event: Event | null = null;
      let created = false;

      if (existing) {
        if (existing.eventId !== input.eventId || existing.quantity !== input.quantity) {
          throw new AppError('IDEMPOTENCY_CONFLICT');
        }
        event = await Event.findByPk(existing.eventId);
      } else {
        try {
          const result = await sequelize.transaction(async (transaction) => {
            const locked = await Event.findByPk(input.eventId, {
              lock: transaction.LOCK.UPDATE,
              transaction,
            });
            if (locked?.status !== 'published') {
              throw new AppError('NOT_FOUND', { message: 'Event not found.' });
            }
            const now = new Date();
            if (!passesOnSale(locked, now) || locked.passPricePaise === null) {
              throw new AppError('PASSES_NOT_ON_SALE');
            }
            // One open order per member and event: a new checkout releases the previous hold.
            await Order.update(
              { status: 'expired' },
              {
                where: { userId, eventId: locked.id, status: 'created' },
                transaction,
              },
            );
            if (locked.passCapacity !== null) {
              const { sold, reserved } = await seatCounts(sequelize, locked.id, {
                now,
                transaction,
              });
              if (sold + reserved + input.quantity > locked.passCapacity) {
                throw new AppError('SOLD_OUT');
              }
            }
            const row = await Order.create(
              {
                userId,
                eventId: locked.id,
                idempotencyKey,
                quantity: input.quantity,
                // The price always comes from the event, never from the client.
                unitPricePaise: locked.passPricePaise,
                amountPaise: locked.passPricePaise * input.quantity,
                expiresAt: new Date(now.getTime() + LIMITS.ORDER_EXPIRY_MINUTES * MINUTE_MS),
              },
              { transaction },
            );
            return { row, locked };
          });
          order = result.row;
          event = result.locked;
          created = true;
        } catch (err) {
          // Two requests with the same key raced: the other one won; return its order.
          if (!(err instanceof UniqueConstraintError)) throw err;
          order = await Order.findOne({ where: { userId, idempotencyKey } });
          event = order ? await Event.findByPk(order.eventId) : null;
        }
      }
      if (!order || !event) throw new AppError('NOT_FOUND', { message: 'Order not found.' });
      if (order.status === 'created' && !order.razorpayOrderId) {
        await attachRazorpayOrder(order, event);
      }
      if (order.status === 'failed') throw new AppError('PAYMENT_PROVIDER_ERROR');
      if (!order.razorpayOrderId) throw new AppError('ORDER_EXPIRED');

      order.event = event;
      return {
        created,
        result: {
          order: await orderView(order),
          checkout: {
            keyId: requireGateway().keyId,
            razorpayOrderId: order.razorpayOrderId,
            amountPaise: order.amountPaise,
            currency: 'INR',
            name: 'Garba Partner',
            description: `${String(order.quantity)} × pass · ${event.name}`.slice(0, 250),
          },
        },
      };
    },

    async getOrder(userId, orderId) {
      const order = await Order.findOne({
        where: { id: orderId, userId },
        include: [{ model: Event, as: 'event' }],
      });
      if (!order) throw new AppError('NOT_FOUND', { message: 'Order not found.' });
      return orderView(order);
    },

    async verify(userId, orderId, input) {
      const gateway = requireGateway();
      const order = await Order.findOne({ where: { id: orderId, userId } });
      if (!order) throw new AppError('NOT_FOUND', { message: 'Order not found.' });
      if (!order.razorpayOrderId || order.razorpayOrderId !== input.razorpayOrderId) {
        throw new AppError('PAYMENT_VERIFICATION_FAILED');
      }
      const signed = gateway.verifyPaymentSignature({
        orderId: order.razorpayOrderId,
        paymentId: input.razorpayPaymentId,
        signature: input.razorpaySignature,
      });
      if (!signed) {
        logger.warn({ orderId }, 'Invalid checkout signature');
        throw new AppError('PAYMENT_VERIFICATION_FAILED');
      }
      // The signature proves Razorpay issued this pair; the payment's STATE comes from Razorpay.
      const remote = await gateway.fetchPayment(input.razorpayPaymentId);
      if (remote.order_id !== order.razorpayOrderId) {
        throw new AppError('PAYMENT_VERIFICATION_FAILED');
      }
      await finalize(remote);
      await order.reload({ include: [{ model: Event, as: 'event' }] });
      const booking = await EventBooking.findOne({
        where: { orderId: order.id },
        attributes: ['id'],
      });
      return {
        order: await orderView(order),
        booking: booking ? await bookingView(booking.id) : null,
      };
    },

    async listBookings(userId, query) {
      const limit = Math.min(query.limit ?? LIMITS.BOOKINGS_PAGE_SIZE, LIMITS.BOOKINGS_PAGE_SIZE);
      const conditions: WhereOptions[] = [{ userId }];
      if (query.cursor) {
        const cursor = decodeCursor(query.cursor);
        const at = new Date(cursor.createdAt);
        conditions.push({
          [Op.or]: [{ createdAt: { [Op.lt]: at } }, { createdAt: at, id: { [Op.lt]: cursor.id } }],
        });
      }
      const rows = await EventBooking.findAll({
        where: { [Op.and]: conditions },
        include: [{ model: Event, as: 'event' }],
        order: [
          ['createdAt', 'DESC'],
          ['id', 'DESC'],
        ],
        limit: limit + 1,
      });
      const page = rows.slice(0, limit);
      const last = page.at(-1);
      return {
        items: page.map(toBookingDto),
        meta: {
          nextCursor:
            rows.length > limit && last
              ? encodeCursor({ createdAt: last.createdAt.toISOString(), id: last.id })
              : null,
        },
      };
    },

    async getBooking(userId, bookingId) {
      const booking = await EventBooking.findOne({
        where: { id: bookingId, userId },
        attributes: ['id'],
      });
      if (!booking) throw new AppError('NOT_FOUND', { message: 'Booking not found.' });
      return bookingView(booking.id);
    },

    async handleWebhook(rawBody, headers) {
      const gateway = requireGateway();
      if (!gateway.verifyWebhookSignature(rawBody, header(headers, 'x-razorpay-signature'))) {
        logger.warn('Rejected Razorpay webhook with an invalid signature');
        throw new AppError('UNAUTHENTICATED', { message: 'Invalid webhook signature.' });
      }
      let body: {
        event?: unknown;
        payload?: {
          payment?: { entity?: RazorpayPayment };
          refund?: { entity?: RazorpayRefund };
        };
      };
      try {
        body = JSON.parse(rawBody.toString('utf8')) as typeof body;
      } catch {
        throw new AppError('VALIDATION_ERROR', { message: 'Invalid webhook body.' });
      }
      const event = typeof body.event === 'string' ? body.event.slice(0, 60) : 'unknown';
      const paymentEntity = body.payload?.payment?.entity;
      const refundEntity = body.payload?.refund?.entity;
      // Razorpay sends a unique X-Razorpay-Event-Id; fall back to a hash of the signed body.
      const eventId = (
        header(headers, 'x-razorpay-event-id') ?? createHash('sha256').update(rawBody).digest('hex')
      ).slice(0, 64);

      const [record] = await PaymentWebhookEvent.findOrCreate({
        where: { eventId },
        defaults: {
          eventId,
          event,
          razorpayPaymentId: paymentEntity?.id ?? refundEntity?.payment_id ?? null,
          razorpayOrderId: paymentEntity?.order_id ?? null,
        },
      });
      if (record.processedAt) return { duplicate: true };

      if (WEBHOOK_PAYMENT_EVENTS.has(event) && paymentEntity) {
        await finalize(paymentEntity);
      } else if (WEBHOOK_REFUND_EVENTS.has(event) && refundEntity) {
        await onRefundWebhook(refundEntity);
      }
      // Anything else is acknowledged and ignored. Marked processed only after success, so a
      // failure returns 5xx and Razorpay's retry processes it again.
      await record.update({ processedAt: new Date() });
      return { duplicate: false };
    },

    async refundBooking(actor, bookingId, reason) {
      requireGateway();
      const target = await sequelize.transaction(async (transaction) => {
        const booking = await EventBooking.findByPk(bookingId, {
          lock: transaction.LOCK.UPDATE,
          transaction,
        });
        if (!booking) throw new AppError('NOT_FOUND', { message: 'Booking not found.' });
        if (booking.refundStatus === 'pending' || booking.refundStatus === 'processed') {
          throw new AppError('CONFLICT', {
            message:
              booking.refundStatus === 'processed'
                ? 'This booking has already been refunded.'
                : 'A refund for this booking is already in progress.',
          });
        }
        const payment = await Payment.findByPk(booking.paymentId, {
          lock: transaction.LOCK.UPDATE,
          transaction,
        });
        if (payment?.status !== 'captured') {
          throw new AppError('CONFLICT', { message: 'This payment cannot be refunded.' });
        }
        const retry = booking.refundStatus === 'failed';
        const now = new Date();
        await booking.update(
          {
            status: 'cancelled',
            cancelReason: booking.cancelReason ?? 'admin_refund',
            cancelledAt: booking.cancelledAt ?? now,
            refundStatus: 'pending',
          },
          { transaction },
        );
        await payment.update({ refundStatus: 'pending' }, { transaction });
        await recordAdminAction(
          {
            adminId: actor.adminId,
            action: retry ? 'booking.refund_retry' : 'booking.refund',
            targetType: 'booking',
            targetId: booking.id,
            metadata: {
              reason,
              amountPaise: payment.amountPaise - payment.amountRefundedPaise,
              orderId: booking.orderId,
              razorpayPaymentId: payment.razorpayPaymentId,
            },
            ip: actor.ip,
          },
          env.OTP_HMAC_SECRET,
          transaction,
        );
        return { booking, payment, retry };
      });
      // After commit: cancellation notice, then the provider call.
      if (!target.retry) await notifyBooking(target.booking, 'cancelled');
      await startRefund(target.payment, target.booking);
    },

    async expireOrders(now = new Date()) {
      const due = await Order.findAll({
        where: { status: 'created', expiresAt: { [Op.lte]: now } },
        order: [['expiresAt', 'ASC']],
        limit: 100,
      });
      let reconciled = 0;
      for (const order of due) {
        if (order.razorpayOrderId && deps.gateway) {
          try {
            // Missed webhook? Ask Razorpay before releasing the seats.
            const payments = await deps.gateway.fetchOrderPayments(order.razorpayOrderId);
            for (const payment of payments) {
              const outcome = await finalize(payment);
              if (outcome.kind === 'booked') reconciled += 1;
            }
          } catch (err) {
            logger.error({ err, orderId: order.id }, 'Order reconciliation failed; will retry');
            continue;
          }
        }
        await Order.update({ status: 'expired' }, { where: { id: order.id, status: 'created' } });
      }
      const expired = await Order.count({
        where: { id: due.map((o) => o.id), status: 'expired' },
      });
      return { expired, reconciled };
    },
  };
}
