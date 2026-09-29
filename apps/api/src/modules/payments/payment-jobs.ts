import type { Logger } from 'pino';
import type { PaymentsService } from './payments.service.js';

const DEFAULT_INTERVAL_MS = 60 * 1000;

/**
 * Every minute: reconciles lapsed unpaid orders with Razorpay (catches missed webhooks) and
 * expires them, releasing their seats (docs/payments/webhook.md#6-reconciliation). Returns a stop
 * function.
 */
export function startPaymentJobs(deps: {
  payments: PaymentsService;
  logger: Logger;
  intervalMs?: number;
}): () => void {
  let running = false;
  async function tick(): Promise<void> {
    if (running) return;
    running = true;
    try {
      const { expired, reconciled } = await deps.payments.expireOrders();
      if (expired > 0 || reconciled > 0) {
        deps.logger.info({ expired, reconciled }, 'Payment jobs ran');
      }
    } catch (err) {
      deps.logger.error({ err }, 'Payment jobs failed');
    } finally {
      running = false;
    }
  }
  const timer = setInterval(() => void tick(), deps.intervalMs ?? DEFAULT_INTERVAL_MS);
  timer.unref();
  void tick();
  return () => {
    clearInterval(timer);
  };
}
