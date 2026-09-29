import type { Logger } from 'pino';
import type { ServerEnv } from '@garba-partner/config/server';
import { createRazorpayGateway, type PaymentGateway } from './razorpay.gateway.js';

export type { PaymentGateway } from './razorpay.gateway.js';

/** The configured payment gateway, or null when online pass sales are disabled. */
export function createPaymentGateway(env: ServerEnv, logger: Logger): PaymentGateway | null {
  if (env.PAYMENT_PROVIDER !== 'razorpay') return null;
  const { RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET, RAZORPAY_WEBHOOK_SECRET } = env;
  // The env schema already requires these; this narrows the types.
  if (!RAZORPAY_KEY_ID || !RAZORPAY_KEY_SECRET || !RAZORPAY_WEBHOOK_SECRET) return null;
  return createRazorpayGateway({
    keyId: RAZORPAY_KEY_ID,
    keySecret: RAZORPAY_KEY_SECRET,
    webhookSecret: RAZORPAY_WEBHOOK_SECRET,
    logger,
  });
}
