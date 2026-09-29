import { randomUUID } from 'node:crypto';
import type { Express } from 'express';
import { pino } from 'pino';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import type {
  AdminBookingDto,
  BookingDto,
  CreatedOrderDto,
  EventDetailDto,
  OrderDto,
  VerifyPaymentResultDto,
} from '@garba-partner/shared';
import {
  AdminAuditLog,
  EventBooking,
  Notification,
  Order,
  Payment,
  PaymentWebhookEvent,
} from '../../models/index.js';
import { bearer, createEvent, createOrganizer, publishEvent } from '../../test/event-fixtures.js';
import { createRealtimeHub } from '../../realtime/hub.js';
import {
  createFakeMediaStorage,
  createTestApp,
  createTestEnv,
  hasTestDatabase,
  loginAdmin,
  uniqueIp,
  useTestDatabase,
} from '../../test/helpers.js';
import { createMember, type TestMember } from '../../test/member-fixtures.js';
import {
  createRazorpayMock,
  TEST_RAZORPAY_KEY_ID,
  type RazorpayMock,
} from '../../test/razorpay-mock.js';
import { createNotifier } from '../notifications/notifications.service.js';
import { createPaymentsService } from './payments.service.js';

const MINUTE_MS = 60 * 1000;
const PRICE = 49_900; // ₹499

describe.skipIf(!hasTestDatabase)('event pass payments (integration)', () => {
  const db = useTestDatabase();
  let app: Express;
  let razorpay: RazorpayMock;
  let ip: string;
  let eventId: string;
  let managerToken: string;

  async function setupEvent(pass: { pricePaise: number | null; capacity: number | null }) {
    const organizer = await createOrganizer(app, managerToken);
    const event = await createEvent(app, managerToken, organizer.id);
    await publishEvent(app, managerToken, event.id);
    await request(app)
      .put(`/api/v1/admin/events/${event.id}/pass`)
      .set(bearer(managerToken))
      .send(pass)
      .expect(200);
    return event.id;
  }

  beforeEach(async () => {
    razorpay = createRazorpayMock();
    app = createTestApp({ sequelize: db(), payments: razorpay.gateway });
    ip = uniqueIp();
    managerToken = (await loginAdmin(app, ip, 'event_manager')).accessToken;
    eventId = await setupEvent({ pricePaise: PRICE, capacity: 5 });
  });

  /** A service instance for job-level calls (same database, same mocked Razorpay). */
  const service = () =>
    createPaymentsService({
      sequelize: db(),
      env: createTestEnv(),
      gateway: razorpay.gateway,
      notifier: createNotifier({
        sequelize: db(),
        media: createFakeMediaStorage(),
        hub: createRealtimeHub(),
        logger: pino({ level: 'silent' }),
      }),
      logger: pino({ level: 'silent' }),
    });

  const createOrder = (m: TestMember, body: object, key: string = randomUUID()) =>
    request(app)
      .post('/api/v1/orders')
      .set(bearer(m.accessToken))
      .set('Idempotency-Key', key)
      .send(body);

  async function order(m: TestMember, quantity = 2, event = eventId) {
    const res = await createOrder(m, { eventId: event, quantity });
    expect(res.status).toBe(201);
    return res.body.data as CreatedOrderDto;
  }

  const verify = (m: TestMember, orderId: string, checkout: object) =>
    request(app).post(`/api/v1/orders/${orderId}/verify`).set(bearer(m.accessToken)).send(checkout);

  const sendWebhook = (hook: { body: string; headers: Record<string, string> }) =>
    request(app).post('/api/v1/webhooks/razorpay').set(hook.headers).send(hook.body);

  describe('orders', () => {
    it('shows pass availability on the event page', async () => {
      const res = await request(app).get(`/api/v1/events/${eventId}`).expect(200);
      expect((res.body.data as EventDetailDto).pass).toEqual({
        pricePaise: PRICE,
        currency: 'INR',
        maxPerOrder: 6,
        onSale: true,
        remaining: 5,
        soldOut: false,
      });
    });

    it('creates a Razorpay order for the server-computed amount, idempotently', async () => {
      const member = await createMember(app);
      const key = randomUUID();
      const first = await createOrder(member, { eventId, quantity: 2 }, key);
      expect(first.status).toBe(201);
      const created = first.body.data as CreatedOrderDto;
      expect(created.order).toMatchObject({
        status: 'created',
        quantity: 2,
        unitPricePaise: PRICE,
        amountPaise: 2 * PRICE,
        bookingId: null,
      });
      expect(created.checkout).toMatchObject({
        keyId: TEST_RAZORPAY_KEY_ID,
        amountPaise: 2 * PRICE,
        currency: 'INR',
      });
      // The Razorpay request carried our amount, our order ID as receipt, and API auth.
      const call = razorpay.requests.find((r) => r.path === '/orders');
      expect(call?.body).toMatchObject({
        amount: 2 * PRICE,
        currency: 'INR',
        receipt: created.order.id,
      });
      expect(call?.authorization).toMatch(/^Basic /);
      // The key secret never reaches the client.
      expect(JSON.stringify(first.body)).not.toContain('test_key_secret');

      const retry = await createOrder(member, { eventId, quantity: 2 }, key);
      expect(retry.status).toBe(200);
      expect((retry.body.data as CreatedOrderDto).order.id).toBe(created.order.id);
      expect(razorpay.orders.size).toBe(1);
      expect((await createOrder(member, { eventId, quantity: 3 }, key)).status).toBe(409);
    });

    it('never accepts an amount from the client and validates input', async () => {
      const member = await createMember(app);
      expect((await createOrder(member, { eventId, quantity: 1, amountPaise: 100 })).status).toBe(
        400,
      );
      expect((await createOrder(member, { eventId, quantity: 7 })).status).toBe(400);
      expect(
        (
          await request(app)
            .post('/api/v1/orders')
            .set(bearer(member.accessToken))
            .send({ eventId, quantity: 1 })
        ).status,
      ).toBe(400); // no Idempotency-Key
      expect(
        (await request(app).post('/api/v1/orders').send({ eventId, quantity: 1 })).status,
      ).toBe(401);
      const noPasses = await setupEvent({ pricePaise: null, capacity: null });
      const res = await createOrder(member, { eventId: noPasses, quantity: 1 });
      expect(res.body.error.code).toBe('PASSES_NOT_ON_SALE');
    });

    it('never oversells: holds seats, releases them on expiry', async () => {
      const [a, b] = [await createMember(app), await createMember(app)];
      await order(a, 4);
      expect((await createOrder(b, { eventId, quantity: 2 })).body.error.code).toBe('SOLD_OUT');
      await order(b, 1);
      const detail = await request(app).get(`/api/v1/events/${eventId}`);
      expect((detail.body.data as EventDetailDto).pass).toMatchObject({
        remaining: 0,
        soldOut: true,
      });

      // A's hold lapses (no payment at Razorpay) → seats return.
      const result = await service().expireOrders(new Date(Date.now() + 16 * MINUTE_MS));
      expect(result).toEqual({ expired: 2, reconciled: 0 });
      expect(await Order.count({ where: { status: 'expired' } })).toBe(2);
    });

    it('marks the order failed when Razorpay is down, releasing the seats', async () => {
      const member = await createMember(app);
      razorpay.failNext(/^\/orders$/, 500);
      const res = await createOrder(member, { eventId, quantity: 5 });
      expect(res.status).toBe(502);
      expect(res.body.error.code).toBe('PAYMENT_PROVIDER_ERROR');
      expect(await Order.findOne()).toMatchObject({ status: 'failed' });
      await order(member, 5); // all five seats are free again
    });

    it('releases the previous hold when the same member starts a new checkout', async () => {
      const member = await createMember(app);
      await order(member, 5);
      await order(member, 5);
      expect(await Order.count({ where: { status: 'created' } })).toBe(1);
    });

    it('is unavailable when payments are disabled', async () => {
      const disabled = createTestApp({ sequelize: db() });
      const member = await createMember(disabled);
      const res = await request(disabled)
        .post('/api/v1/orders')
        .set(bearer(member.accessToken))
        .set('Idempotency-Key', randomUUID())
        .send({ eventId, quantity: 1 });
      expect(res.status).toBe(503);
      expect(
        (await request(disabled).post('/api/v1/webhooks/razorpay').send({ event: 'x' })).status,
      ).toBe(503);
    });
  });

  describe('checkout verification (never trusting the client)', () => {
    it('books after a verified, captured payment, exactly once', async () => {
      const member = await createMember(app);
      const created = await order(member, 2);
      const { checkout } = razorpay.pay(created.checkout.razorpayOrderId);

      const res = await verify(member, created.order.id, checkout);
      expect(res.status).toBe(200);
      const result = res.body.data as VerifyPaymentResultDto;
      expect(result.order.status).toBe('paid');
      expect(result.booking).toMatchObject({
        status: 'confirmed',
        refundStatus: 'none',
        quantity: 2,
        amountPaise: 2 * PRICE,
      });
      expect(result.booking?.code).toMatch(/^GP-[A-Z2-9]{8}$/);

      // Verifying again (double click, retry) changes nothing.
      await verify(member, created.order.id, checkout).expect(200);
      expect(await EventBooking.count()).toBe(1);
      expect(await Payment.findOne()).toMatchObject({ status: 'captured', method: 'upi' });
      expect(await Notification.count({ where: { userId: member.userId, type: 'booking' } })).toBe(
        1,
      );

      const mine = await request(app).get('/api/v1/bookings').set(bearer(member.accessToken));
      expect((mine.body.data as BookingDto[]).map((b) => b.id)).toEqual([result.booking?.id]);
      const other = await createMember(app);
      expect(
        (
          await request(app)
            .get(`/api/v1/bookings/${result.booking?.id ?? ''}`)
            .set(bearer(other.accessToken))
        ).status,
      ).toBe(404);
    });

    it('rejects forged signatures, other orders and other members', async () => {
      const member = await createMember(app);
      const created = await order(member, 1);
      const { checkout } = razorpay.pay(created.checkout.razorpayOrderId);

      const forged = { ...checkout, razorpaySignature: 'a'.repeat(64) };
      const bad = await verify(member, created.order.id, forged);
      expect(bad.status).toBe(400);
      expect(bad.body.error.code).toBe('PAYMENT_VERIFICATION_FAILED');

      const otherOrder = await order(await createMember(app), 1);
      expect(
        (
          await verify(member, created.order.id, {
            ...checkout,
            razorpayOrderId: otherOrder.checkout.razorpayOrderId,
          })
        ).status,
      ).toBe(400);
      const stranger = await createMember(app);
      expect((await verify(stranger, created.order.id, checkout)).status).toBe(404);
      expect(await EventBooking.count()).toBe(0);
    });

    it('does not book when Razorpay says the payment failed, even with a valid signature', async () => {
      const member = await createMember(app);
      const created = await order(member, 1);
      const { checkout } = razorpay.pay(created.checkout.razorpayOrderId, 'failed');
      const res = await verify(member, created.order.id, checkout);
      expect(res.status).toBe(200);
      const result = res.body.data as VerifyPaymentResultDto;
      expect(result.booking).toBeNull();
      expect(result.order.status).toBe('created'); // the member can retry
      expect(result.order.lastPaymentError).toEqual({
        code: 'BAD_REQUEST_ERROR',
        description: 'Payment was cancelled by the bank.',
      });

      // Retry with a successful payment on the same order.
      const retry = razorpay.pay(created.checkout.razorpayOrderId, 'captured');
      const ok = (await verify(member, created.order.id, retry.checkout)).body
        .data as VerifyPaymentResultDto;
      expect(ok.booking?.status).toBe('confirmed');
    });

    it('captures authorized payments server-side for the order amount', async () => {
      const member = await createMember(app);
      const created = await order(member, 3);
      const { checkout } = razorpay.pay(created.checkout.razorpayOrderId, 'authorized');
      const result = (await verify(member, created.order.id, checkout)).body
        .data as VerifyPaymentResultDto;
      expect(result.booking?.status).toBe('confirmed');
      const capture = razorpay.requests.find((r) => r.path.endsWith('/capture'));
      expect(capture?.body).toEqual({ amount: 3 * PRICE, currency: 'INR' });
    });
  });

  describe('webhooks', () => {
    it('books from a signed payment.captured webhook without any client call', async () => {
      const member = await createMember(app);
      const created = await order(member, 2);
      const { payment } = razorpay.pay(created.checkout.razorpayOrderId);
      const hook = razorpay.webhook('payment.captured', { payment });

      const res = await sendWebhook(hook);
      expect(res.status).toBe(200);
      expect(res.body.data).toEqual({ received: true, duplicate: false });
      expect(await EventBooking.count({ where: { status: 'confirmed' } })).toBe(1);

      // Razorpay retries deliver the same event ID: handled once.
      const again = await sendWebhook(hook);
      expect(again.body.data.duplicate).toBe(true);
      // order.paid for the same payment and a late client verify: still one booking.
      await sendWebhook(razorpay.webhook('order.paid', { payment })).expect(200);
      expect(await EventBooking.count()).toBe(1);
      expect(await PaymentWebhookEvent.count()).toBe(2);

      const orderView = await request(app)
        .get(`/api/v1/orders/${created.order.id}`)
        .set(bearer(member.accessToken));
      expect((orderView.body.data as OrderDto).status).toBe('paid');
    });

    it('rejects bad signatures and tampered bodies', async () => {
      const member = await createMember(app);
      const created = await order(member, 1);
      const { payment } = razorpay.pay(created.checkout.razorpayOrderId);
      const hook = razorpay.webhook('payment.captured', { payment });

      const tampered = hook.body.replace(`"amount":${String(PRICE)}`, '"amount":100');
      expect((await sendWebhook({ ...hook, body: tampered })).status).toBe(401);
      expect(
        (
          await sendWebhook({
            ...hook,
            headers: { ...hook.headers, 'X-Razorpay-Signature': 'b'.repeat(64) },
          })
        ).status,
      ).toBe(401);
      const { 'X-Razorpay-Signature': _omit, ...unsigned } = hook.headers;
      expect((await sendWebhook({ ...hook, headers: unsigned })).status).toBe(401);
      expect(await EventBooking.count()).toBe(0);
      expect(await PaymentWebhookEvent.count()).toBe(0);
    });

    it('records failures, ignores out-of-order failures and unknown orders', async () => {
      const member = await createMember(app);
      const created = await order(member, 1);
      const failed = razorpay.pay(created.checkout.razorpayOrderId, 'failed').payment;
      await sendWebhook(razorpay.webhook('payment.failed', { payment: failed })).expect(200);
      expect(await Payment.findOne({ where: { razorpayPaymentId: failed.id } })).toMatchObject({
        status: 'failed',
        errorReason: 'Payment was cancelled by the bank.',
      });

      const captured = razorpay.pay(created.checkout.razorpayOrderId).payment;
      await sendWebhook(razorpay.webhook('payment.captured', { payment: captured })).expect(200);
      // A stale "failed" event for the captured payment arrives late: it stays captured.
      await sendWebhook(
        razorpay.webhook('payment.failed', { payment: { ...captured, status: 'failed' } }),
      ).expect(200);
      expect(await Payment.findOne({ where: { razorpayPaymentId: captured.id } })).toMatchObject({
        status: 'captured',
      });

      const unknown = { ...captured, id: 'pay_unknown000001', order_id: 'order_unknown000001' };
      await sendWebhook(razorpay.webhook('payment.captured', { payment: unknown })).expect(200);
      await sendWebhook(razorpay.webhook('subscription.charged', {})).expect(200);
      expect(await EventBooking.count()).toBe(1);
    });

    it('refunds a second captured payment for an already-paid order', async () => {
      const member = await createMember(app);
      const created = await order(member, 1);
      const first = razorpay.pay(created.checkout.razorpayOrderId).payment;
      const second = razorpay.pay(created.checkout.razorpayOrderId).payment;
      await sendWebhook(razorpay.webhook('payment.captured', { payment: first })).expect(200);
      await sendWebhook(razorpay.webhook('payment.captured', { payment: second })).expect(200);

      expect(await EventBooking.count()).toBe(1);
      expect(await Payment.findOne({ where: { razorpayPaymentId: second.id } })).toMatchObject({
        status: 'refunded',
        refundStatus: 'processed',
        amountRefundedPaise: PRICE,
      });
      const refundCall = razorpay.requests.find((r) => r.path.endsWith('/refund'));
      expect(refundCall?.path).toBe(`/payments/${second.id}/refund`);
    });
  });

  describe('late payments and reconciliation', () => {
    it('refunds a payment that arrives after the hold lapsed and the passes sold out', async () => {
      const [late, other] = [await createMember(app), await createMember(app)];
      const lateOrder = await order(late, 5);
      await service().expireOrders(new Date(Date.now() + 16 * MINUTE_MS));
      await order(other, 5); // the seats went to someone else

      const { payment } = razorpay.pay(lateOrder.checkout.razorpayOrderId);
      await sendWebhook(razorpay.webhook('payment.captured', { payment })).expect(200);
      const booking = await EventBooking.findOne({ where: { userId: late.userId } });
      expect(booking).toMatchObject({
        status: 'cancelled',
        cancelReason: 'sold_out',
        refundStatus: 'processed',
      });
      expect(await Order.findByPk(lateOrder.order.id)).toMatchObject({ status: 'paid' });
      const kinds = (
        await Notification.findAll({ where: { userId: late.userId, type: 'booking' } })
      )
        .map((n) => n.data.bookingKind)
        .sort();
      expect(kinds).toEqual(['cancelled', 'refund_processed']);
    });

    it('honours a late payment when seats are still free', async () => {
      const member = await createMember(app);
      const created = await order(member, 2);
      await service().expireOrders(new Date(Date.now() + 16 * MINUTE_MS));
      const { payment } = razorpay.pay(created.checkout.razorpayOrderId);
      await sendWebhook(razorpay.webhook('payment.captured', { payment })).expect(200);
      expect(await EventBooking.findOne()).toMatchObject({ status: 'confirmed' });
    });

    it('finds captured payments with no webhook and no client call before expiring', async () => {
      const member = await createMember(app);
      const created = await order(member, 2);
      razorpay.pay(created.checkout.razorpayOrderId);
      const result = await service().expireOrders(new Date(Date.now() + 16 * MINUTE_MS));
      expect(result.reconciled).toBe(1);
      expect(await Order.findByPk(created.order.id)).toMatchObject({ status: 'paid' });
      expect(await EventBooking.findOne()).toMatchObject({ status: 'confirmed' });
    });
  });

  describe('refunds', () => {
    async function paidBooking(): Promise<{ member: TestMember; bookingId: string }> {
      const member = await createMember(app);
      const created = await order(member, 2);
      const { checkout } = razorpay.pay(created.checkout.razorpayOrderId);
      const result = (await verify(member, created.order.id, checkout)).body
        .data as VerifyPaymentResultDto;
      return { member, bookingId: result.booking?.id ?? '' };
    }
    const refund = (token: string, bookingId: string, reason = 'Customer asked to cancel') =>
      request(app)
        .post(`/api/v1/admin/payments/bookings/${bookingId}/refund`)
        .set(bearer(token))
        .send({ reason });

    it('lets super admins refund; event managers can only view', async () => {
      const { member, bookingId } = await paidBooking();
      const list = await request(app)
        .get('/api/v1/admin/payments/bookings')
        .set(bearer(managerToken));
      expect(list.status).toBe(200);
      const [item] = list.body.data as AdminBookingDto[];
      expect(item?.payment).toMatchObject({ status: 'captured', method: 'upi' });
      expect(JSON.stringify(list.body)).not.toContain(member.phone);
      expect((await refund(managerToken, bookingId)).status).toBe(403);

      const superAdmin = (await loginAdmin(app, ip, 'super_admin')).accessToken;
      const res = await refund(superAdmin, bookingId);
      expect(res.status).toBe(200);
      expect(res.body.data).toMatchObject({
        status: 'cancelled',
        cancelReason: 'admin_refund',
        refundStatus: 'processed',
        payment: { status: 'refunded', amountRefundedPaise: 2 * PRICE },
      });
      expect(razorpay.requests.find((r) => r.path.endsWith('/refund'))?.body).toMatchObject({
        amount: 2 * PRICE,
      });
      const audit = await AdminAuditLog.findOne({ where: { action: 'booking.refund' } });
      expect(audit).toMatchObject({ targetType: 'booking', targetId: bookingId });
      expect((await refund(superAdmin, bookingId)).status).toBe(409);

      // The member's pass shows the refund; the seats are free again.
      const view = await request(app)
        .get(`/api/v1/bookings/${bookingId}`)
        .set(bearer(member.accessToken));
      expect(view.body.data).toMatchObject({ status: 'cancelled', refundStatus: 'processed' });
      const detail = await request(app).get(`/api/v1/events/${eventId}`);
      expect((detail.body.data as EventDetailDto).pass?.remaining).toBe(5);
    });

    it('tracks pending refunds through the refund webhook', async () => {
      const { bookingId } = await paidBooking();
      razorpay.setRefundStatus('pending');
      const superAdmin = (await loginAdmin(app, ip, 'super_admin')).accessToken;
      const res = await refund(superAdmin, bookingId);
      expect(res.body.data.refundStatus).toBe('pending');

      const [rp] = [...razorpay.refunds.values()];
      if (!rp) throw new Error('no refund');
      await sendWebhook(
        razorpay.webhook('refund.processed', { refund: { ...rp, status: 'processed' } }),
      ).expect(200);
      const after = await request(app)
        .get(`/api/v1/admin/payments/bookings/${bookingId}`)
        .set(bearer(superAdmin));
      expect(after.body.data).toMatchObject({
        refundStatus: 'processed',
        payment: { status: 'refunded', razorpayRefundId: rp.id },
      });
    });

    it('records a failed refund call and allows a retry', async () => {
      const { bookingId } = await paidBooking();
      const superAdmin = (await loginAdmin(app, ip, 'super_admin')).accessToken;
      razorpay.failNext(/\/refund$/, 500);
      const failed = await refund(superAdmin, bookingId);
      expect(failed.status).toBe(200);
      expect(failed.body.data).toMatchObject({ status: 'cancelled', refundStatus: 'failed' });

      const retried = await refund(superAdmin, bookingId, 'Retrying after provider outage');
      expect(retried.body.data.refundStatus).toBe('processed');
      expect(await AdminAuditLog.count({ where: { action: 'booking.refund_retry' } })).toBe(1);
    });
  });

  describe('admin pass settings', () => {
    it('are audited, permission-checked and never below sold passes', async () => {
      const member = await createMember(app);
      const created = await order(member, 3);
      const { checkout } = razorpay.pay(created.checkout.razorpayOrderId);
      await verify(member, created.order.id, checkout).expect(200);

      const put = (token: string, body: object) =>
        request(app).put(`/api/v1/admin/events/${eventId}/pass`).set(bearer(token)).send(body);
      expect((await put(managerToken, { pricePaise: PRICE, capacity: 2 })).status).toBe(400);
      expect((await put(managerToken, { pricePaise: 50, capacity: 10 })).status).toBe(400);
      const moderator = (await loginAdmin(app, ip, 'moderator')).accessToken;
      expect((await put(moderator, { pricePaise: PRICE, capacity: 10 })).status).toBe(403);

      const saved = await put(managerToken, { pricePaise: 59_900, capacity: 10 });
      expect(saved.body.data.pass).toEqual({
        pricePaise: 59_900,
        capacity: 10,
        sold: 3,
        reserved: 0,
      });
      // Existing orders keep their price.
      expect(await Order.findByPk(created.order.id)).toMatchObject({ unitPricePaise: PRICE });
      expect(await AdminAuditLog.count({ where: { action: 'event.pass_update' } })).toBeGreaterThan(
        0,
      );
    });
  });
});
