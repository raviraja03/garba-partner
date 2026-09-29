import { createHmac, timingSafeEqual } from 'node:crypto';
import type { Logger } from 'pino';
import { AppError } from '../../lib/app-error.js';

/**
 * Razorpay REST API adapter (docs/payments/razorpay.md). Plain `fetch` + Node crypto: no SDK
 * dependency. Only the fields we use are typed; everything else in Razorpay's responses is
 * ignored. The key secret and webhook secret never leave this module and are never logged.
 */

export const RAZORPAY_API_BASE_URL = 'https://api.razorpay.com/v1';
const REQUEST_TIMEOUT_MS = 10_000;

export interface RazorpayOrder {
  id: string;
  amount: number;
  currency: string;
  receipt: string | null;
  status: 'created' | 'attempted' | 'paid';
}

export interface RazorpayPayment {
  id: string;
  order_id: string | null;
  amount: number;
  currency: string;
  status: 'created' | 'authorized' | 'captured' | 'refunded' | 'failed';
  method: string | null;
  captured: boolean;
  amount_refunded: number;
  refund_status: 'partial' | 'full' | null;
  error_code: string | null;
  error_description: string | null;
  error_reason: string | null;
}

export interface RazorpayRefund {
  id: string;
  payment_id: string;
  amount: number;
  status: 'pending' | 'processed' | 'failed';
}

export interface PaymentGateway {
  /** Public key ID for Razorpay Checkout in the browser. */
  readonly keyId: string;
  createOrder(input: {
    amountPaise: number;
    currency: 'INR';
    receipt: string;
    notes: Record<string, string>;
  }): Promise<RazorpayOrder>;
  fetchPayment(paymentId: string): Promise<RazorpayPayment>;
  fetchOrderPayments(orderId: string): Promise<RazorpayPayment[]>;
  capturePayment(paymentId: string, amountPaise: number, currency: 'INR'): Promise<RazorpayPayment>;
  refundPayment(
    paymentId: string,
    input: { amountPaise: number; receipt: string; notes: Record<string, string> },
  ): Promise<RazorpayRefund>;
  /** Checkout result: HMAC-SHA256(key_secret, "<order_id>|<payment_id>"). */
  verifyPaymentSignature(input: { orderId: string; paymentId: string; signature: string }): boolean;
  /** Webhook: HMAC-SHA256(webhook_secret, raw request body) in `X-Razorpay-Signature`. */
  verifyWebhookSignature(rawBody: Buffer, signature: string | undefined): boolean;
}

function hmacHex(secret: string, payload: string | Buffer): string {
  return createHmac('sha256', secret).update(payload).digest('hex');
}

/** Constant-time comparison of two hex digests (false for malformed input). */
function sameHex(expected: string, actual: string): boolean {
  if (!/^[0-9a-f]{64}$/.test(actual)) return false;
  return timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(actual, 'hex'));
}

export function signCheckout(keySecret: string, orderId: string, paymentId: string): string {
  return hmacHex(keySecret, `${orderId}|${paymentId}`);
}

export function signWebhookBody(webhookSecret: string, rawBody: string | Buffer): string {
  return hmacHex(webhookSecret, rawBody);
}

export function createRazorpayGateway(options: {
  keyId: string;
  keySecret: string;
  webhookSecret: string;
  logger: Logger;
  /** Injected in tests to serve mocked Razorpay responses. */
  fetch?: typeof fetch;
  baseUrl?: string;
}): PaymentGateway {
  const { keyId, keySecret, webhookSecret, logger } = options;
  const doFetch = options.fetch ?? fetch;
  const baseUrl = options.baseUrl ?? RAZORPAY_API_BASE_URL;
  const authorization = `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString('base64')}`;

  async function call<T>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<T> {
    let response: Response;
    try {
      response = await doFetch(`${baseUrl}${path}`, {
        method,
        headers: {
          Authorization: authorization,
          ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch (err) {
      logger.error({ err, method, path }, 'Razorpay request failed');
      throw new AppError('PAYMENT_PROVIDER_ERROR');
    }
    const json: unknown = await response.json().catch(() => null);
    if (!response.ok) {
      // Razorpay's error code/description only: never headers (they carry the key).
      const error = (json as { error?: { code?: string; description?: string } } | null)?.error;
      logger.warn(
        {
          method,
          path,
          status: response.status,
          code: error?.code,
          description: error?.description,
        },
        'Razorpay request rejected',
      );
      throw new AppError('PAYMENT_PROVIDER_ERROR', {
        details: [{ path: 'razorpay', message: error?.code ?? `HTTP ${String(response.status)}` }],
      });
    }
    return json as T;
  }

  return {
    keyId,

    createOrder: ({ amountPaise, currency, receipt, notes }) =>
      call<RazorpayOrder>('POST', '/orders', { amount: amountPaise, currency, receipt, notes }),

    fetchPayment: (paymentId) =>
      call<RazorpayPayment>('GET', `/payments/${encodeURIComponent(paymentId)}`),

    async fetchOrderPayments(orderId) {
      const result = await call<{ items: RazorpayPayment[] }>(
        'GET',
        `/orders/${encodeURIComponent(orderId)}/payments`,
      );
      return result.items;
    },

    capturePayment: (paymentId, amountPaise, currency) =>
      call<RazorpayPayment>('POST', `/payments/${encodeURIComponent(paymentId)}/capture`, {
        amount: amountPaise,
        currency,
      }),

    refundPayment: (paymentId, { amountPaise, receipt, notes }) =>
      call<RazorpayRefund>('POST', `/payments/${encodeURIComponent(paymentId)}/refund`, {
        amount: amountPaise,
        speed: 'normal',
        receipt,
        notes,
      }),

    verifyPaymentSignature: ({ orderId, paymentId, signature }) =>
      sameHex(signCheckout(keySecret, orderId, paymentId), signature),

    verifyWebhookSignature: (rawBody, signature) =>
      signature !== undefined && sameHex(signWebhookBody(webhookSecret, rawBody), signature),
  };
}
