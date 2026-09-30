import { createHmac } from 'node:crypto';
import { pino } from 'pino';
import { describe, expect, it } from 'vitest';
import { serverEnvSchema } from '@garba-partner/config/server';
import { createRazorpayGateway, signCheckout, signWebhookBody } from './razorpay.gateway.js';

const KEY_SECRET = 'unit_test_key_secret_0000';
const WEBHOOK_SECRET = 'unit_test_webhook_secret_00';

const gateway = createRazorpayGateway({
  keyId: 'rzp_test_UnitTest01',
  keySecret: KEY_SECRET,
  webhookSecret: WEBHOOK_SECRET,
  logger: pino({ level: 'silent' }),
  fetch: () => Promise.reject(new Error('no network in unit tests')),
});

describe('Razorpay signatures', () => {
  it('matches Razorpay’s checkout signature: HMAC-SHA256(key_secret, "order_id|payment_id")', () => {
    const expected = createHmac('sha256', KEY_SECRET).update('order_A1|pay_B2').digest('hex');
    expect(signCheckout(KEY_SECRET, 'order_A1', 'pay_B2')).toBe(expected);
    expect(
      gateway.verifyPaymentSignature({
        orderId: 'order_A1',
        paymentId: 'pay_B2',
        signature: expected,
      }),
    ).toBe(true);
  });

  it.each([
    ['another payment', { orderId: 'order_A1', paymentId: 'pay_B3' }],
    ['another order', { orderId: 'order_A2', paymentId: 'pay_B2' }],
  ])('rejects a signature for %s', (_label, ids) => {
    const signature = signCheckout(KEY_SECRET, 'order_A1', 'pay_B2');
    expect(gateway.verifyPaymentSignature({ ...ids, signature })).toBe(false);
  });

  it.each(['', 'not-hex', 'A'.repeat(64), 'a'.repeat(63)])('rejects malformed %j', (signature) => {
    expect(
      gateway.verifyPaymentSignature({ orderId: 'order_A1', paymentId: 'pay_B2', signature }),
    ).toBe(false);
  });

  it('verifies webhooks over the exact raw body', () => {
    const body = Buffer.from('{"event":"payment.captured","payload":{}}');
    const signature = signWebhookBody(WEBHOOK_SECRET, body);
    expect(gateway.verifyWebhookSignature(body, signature)).toBe(true);
    // Re-serialised JSON (different whitespace) is a different body.
    expect(
      gateway.verifyWebhookSignature(
        Buffer.from('{"event": "payment.captured","payload":{}}'),
        signature,
      ),
    ).toBe(false);
    expect(gateway.verifyWebhookSignature(body, undefined)).toBe(false);
    // Signed with the API key secret instead of the webhook secret: rejected.
    expect(gateway.verifyWebhookSignature(body, signWebhookBody(KEY_SECRET, body))).toBe(false);
  });

  it('maps network failures to PAYMENT_PROVIDER_ERROR', async () => {
    await expect(gateway.fetchPayment('pay_X')).rejects.toMatchObject({
      code: 'PAYMENT_PROVIDER_ERROR',
    });
  });
});

describe('payment environment rules', () => {
  const base = {
    DATABASE_URL: 'postgres://u:p@localhost:5432/app',
    PHONE_HASH_SECRET: 'x'.repeat(40),
    PHONE_ENCRYPTION_KEY: Buffer.alloc(32, 1).toString('base64'),
    TOTP_ENCRYPTION_KEY: Buffer.alloc(32, 2).toString('base64'),
    OTP_HMAC_SECRET: 'y'.repeat(40),
    JWT_ACCESS_SECRET: 'm'.repeat(40),
    JWT_ADMIN_ACCESS_SECRET: 'a'.repeat(40),
  };
  const razorpay = {
    PAYMENT_PROVIDER: 'razorpay',
    RAZORPAY_KEY_ID: 'rzp_test_Abc123Def',
    RAZORPAY_KEY_SECRET: 'key-secret-123',
    RAZORPAY_WEBHOOK_SECRET: 'webhook-secret-123',
  };
  const issues = (env: Record<string, string>) => {
    const result = serverEnvSchema.safeParse({ ...base, ...env });
    return result.success ? [] : result.error.issues.map((issue) => issue.path.join('.'));
  };

  it('is disabled by default and accepts test keys in development', () => {
    expect(serverEnvSchema.parse(base).PAYMENT_PROVIDER).toBe('disabled');
    expect(issues(razorpay)).toEqual([]);
  });

  it('requires all three Razorpay values', () => {
    expect(issues({ PAYMENT_PROVIDER: 'razorpay' }).sort()).toEqual([
      'RAZORPAY_KEY_ID',
      'RAZORPAY_KEY_SECRET',
      'RAZORPAY_WEBHOOK_SECRET',
    ]);
  });

  it('refuses live keys outside production and test keys in production', () => {
    expect(issues({ ...razorpay, RAZORPAY_KEY_ID: 'rzp_live_Abc123Def' })).toContain(
      'RAZORPAY_KEY_ID',
    );
    expect(issues({ ...razorpay, RAZORPAY_KEY_ID: 'not-a-key' })).toContain('RAZORPAY_KEY_ID');
    const production = { APP_ENV: 'production', NODE_ENV: 'production', ...razorpay };
    expect(issues(production)).toContain('RAZORPAY_KEY_ID');
  });

  it('requires a webhook secret different from the key secret', () => {
    expect(
      issues({ ...razorpay, RAZORPAY_WEBHOOK_SECRET: razorpay.RAZORPAY_KEY_SECRET }),
    ).toContain('RAZORPAY_WEBHOOK_SECRET');
  });
});
