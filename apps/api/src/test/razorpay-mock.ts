import { randomBytes } from 'node:crypto';
import { pino } from 'pino';
import {
  createRazorpayGateway,
  RAZORPAY_API_BASE_URL,
  signCheckout,
  signWebhookBody,
  type PaymentGateway,
  type RazorpayOrder,
  type RazorpayPayment,
  type RazorpayRefund,
} from '../providers/payments/razorpay.gateway.js';

export const TEST_RAZORPAY_KEY_ID = 'rzp_test_GarbaPartnerTest';
export const TEST_RAZORPAY_KEY_SECRET = 'test_key_secret_not_real_0000';
export const TEST_RAZORPAY_WEBHOOK_SECRET = 'test_webhook_secret_not_real_00';

const id = (prefix: string) => `${prefix}_${randomBytes(7).toString('hex').slice(0, 14)}`;

export interface RecordedRequest {
  method: string;
  path: string;
  body: unknown;
  authorization: string | null;
}

/**
 * An in-memory Razorpay used by integration tests: the REAL gateway adapter talks to it through
 * an injected `fetch`, so request shapes, auth headers, signatures and response parsing are all
 * exercised. Tests "pay" orders the way Razorpay Checkout would and receive signed results.
 */
export function createRazorpayMock(options: { autoCapture?: boolean } = {}) {
  const orders = new Map<string, RazorpayOrder>();
  const payments = new Map<string, RazorpayPayment>();
  const refunds = new Map<string, RazorpayRefund>();
  const requests: RecordedRequest[] = [];
  /** Set to make the next matching calls fail (e.g. `{ path: /\/orders$/, status: 500 }`). */
  const failures: { method?: string; path: RegExp; status: number; times: number }[] = [];
  let refundStatus: RazorpayRefund['status'] = 'processed';

  const json = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    });
  const notFound = () =>
    json(400, {
      error: { code: 'BAD_REQUEST_ERROR', description: 'The id provided does not exist' },
    });

  function handle(input: Parameters<typeof fetch>[0], init: Parameters<typeof fetch>[1]): Response {
    const url = new URL(
      typeof input === 'string' ? input : input instanceof URL ? input.href : input.url,
    );
    const method = init?.method ?? 'GET';
    const path = url.pathname.replace(/^\/v1/, '');
    const body: unknown = typeof init?.body === 'string' ? JSON.parse(init.body) : undefined;
    const headers = new Headers(init?.headers);
    requests.push({ method, path, body, authorization: headers.get('authorization') });

    const failure = failures.find((f) => f.path.test(path) && (!f.method || f.method === method));
    if (failure) {
      failure.times -= 1;
      if (failure.times <= 0) failures.splice(failures.indexOf(failure), 1);
      return json(failure.status, { error: { code: 'SERVER_ERROR', description: 'Mock failure' } });
    }
    const expected = `Basic ${Buffer.from(`${TEST_RAZORPAY_KEY_ID}:${TEST_RAZORPAY_KEY_SECRET}`).toString('base64')}`;
    if (headers.get('authorization') !== expected) {
      return json(401, {
        error: { code: 'BAD_REQUEST_ERROR', description: 'Authentication failed' },
      });
    }

    let match: RegExpExecArray | null;
    if (method === 'POST' && path === '/orders') {
      const input = body as { amount: number; currency: string; receipt: string };
      const order: RazorpayOrder = {
        id: id('order'),
        amount: input.amount,
        currency: input.currency,
        receipt: input.receipt,
        status: 'created',
      };
      orders.set(order.id, order);
      return json(200, order);
    }
    if (method === 'GET' && (match = /^\/orders\/([^/]+)\/payments$/.exec(path))) {
      const orderId = decodeURIComponent(match[1] ?? '');
      if (!orders.has(orderId)) return notFound();
      return json(200, {
        entity: 'collection',
        items: [...payments.values()].filter((p) => p.order_id === orderId),
      });
    }
    if (method === 'GET' && (match = /^\/payments\/([^/]+)$/.exec(path))) {
      const payment = payments.get(decodeURIComponent(match[1] ?? ''));
      return payment ? json(200, payment) : notFound();
    }
    if (method === 'POST' && (match = /^\/payments\/([^/]+)\/capture$/.exec(path))) {
      const payment = payments.get(decodeURIComponent(match[1] ?? ''));
      if (!payment) return notFound();
      if (payment.status !== 'authorized') {
        return json(400, {
          error: {
            code: 'BAD_REQUEST_ERROR',
            description: 'This payment has already been captured',
          },
        });
      }
      payment.status = 'captured';
      payment.captured = true;
      return json(200, payment);
    }
    if (method === 'POST' && (match = /^\/payments\/([^/]+)\/refund$/.exec(path))) {
      const payment = payments.get(decodeURIComponent(match[1] ?? ''));
      if (!payment) return notFound();
      const amount = (body as { amount: number }).amount;
      const refund: RazorpayRefund = {
        id: id('rfnd'),
        payment_id: payment.id,
        amount,
        status: refundStatus,
      };
      refunds.set(refund.id, refund);
      if (refund.status === 'processed') {
        payment.amount_refunded += amount;
        payment.refund_status = payment.amount_refunded >= payment.amount ? 'full' : 'partial';
        if (payment.refund_status === 'full') payment.status = 'refunded';
      }
      return json(200, refund);
    }
    return json(404, { error: { code: 'NOT_FOUND', description: 'Unknown mock route' } });
  }
  const fetchImpl: typeof fetch = (input, init) => Promise.resolve(handle(input, init));

  /** Simulates the customer completing (or failing) Razorpay Checkout for an order. */
  function pay(
    razorpayOrderId: string,
    outcome: 'captured' | 'authorized' | 'failed' = options.autoCapture === false
      ? 'authorized'
      : 'captured',
    overrides: Partial<RazorpayPayment> = {},
  ) {
    const order = orders.get(razorpayOrderId);
    if (!order) throw new Error(`Unknown mock order ${razorpayOrderId}`);
    const payment: RazorpayPayment = {
      id: id('pay'),
      order_id: order.id,
      amount: order.amount,
      currency: order.currency,
      status: outcome,
      method: 'upi',
      captured: outcome === 'captured',
      amount_refunded: 0,
      refund_status: null,
      error_code: outcome === 'failed' ? 'BAD_REQUEST_ERROR' : null,
      error_description: outcome === 'failed' ? 'Payment was cancelled by the bank.' : null,
      error_reason: outcome === 'failed' ? 'payment_cancelled' : null,
      ...overrides,
    };
    payments.set(payment.id, payment);
    if (outcome === 'captured') order.status = 'paid';
    else order.status = 'attempted';
    return {
      payment,
      /** What Razorpay Checkout hands to the browser on success. */
      checkout: {
        razorpayOrderId: order.id,
        razorpayPaymentId: payment.id,
        razorpaySignature: signCheckout(TEST_RAZORPAY_KEY_SECRET, order.id, payment.id),
      },
    };
  }

  /** A signed webhook request as Razorpay would send it. */
  function webhook(
    event: string,
    entities: { payment?: RazorpayPayment; refund?: RazorpayRefund },
    eventId = id('evt'),
  ) {
    const body = JSON.stringify({
      entity: 'event',
      account_id: 'acc_test',
      event,
      contains: Object.keys(entities),
      payload: {
        ...(entities.payment ? { payment: { entity: entities.payment } } : {}),
        ...(entities.refund ? { refund: { entity: entities.refund } } : {}),
      },
      created_at: Math.floor(Date.now() / 1000),
    });
    return {
      body,
      headers: {
        'Content-Type': 'application/json',
        'X-Razorpay-Signature': signWebhookBody(TEST_RAZORPAY_WEBHOOK_SECRET, body),
        'X-Razorpay-Event-Id': eventId,
      },
    };
  }

  const gateway: PaymentGateway = createRazorpayGateway({
    keyId: TEST_RAZORPAY_KEY_ID,
    keySecret: TEST_RAZORPAY_KEY_SECRET,
    webhookSecret: TEST_RAZORPAY_WEBHOOK_SECRET,
    logger: pino({ level: 'silent' }),
    fetch: fetchImpl,
    baseUrl: RAZORPAY_API_BASE_URL,
  });

  return {
    gateway,
    orders,
    payments,
    refunds,
    requests,
    pay,
    webhook,
    failNext(path: RegExp, status = 500, times = 1, method?: string) {
      failures.push({ path, status, times, ...(method ? { method } : {}) });
    },
    setRefundStatus(status: RazorpayRefund['status']) {
      refundStatus = status;
    },
  };
}

export type RazorpayMock = ReturnType<typeof createRazorpayMock>;
