import type { Logger } from 'pino';
import type { Sequelize } from 'sequelize-typescript';
import type { SafetyLogger } from './safety-log.service.js';
import { expireSanctions } from './sanctions.js';

const DEFAULT_INTERVAL_MS = 60 * 1000;

/**
 * Ends timed suspensions and chat restrictions once `ends_at` passes (checked every minute, so a
 * sanction can outlast its end by up to a minute). Returns a function that stops the job.
 * Safe to run in several processes: `expireSanctions` claims rows with SKIP LOCKED.
 */
export function startSanctionExpiryJob(deps: {
  sequelize: Sequelize;
  safetyLog: SafetyLogger;
  logger: Logger;
  intervalMs?: number;
}): () => void {
  const { sequelize, safetyLog, logger } = deps;
  let running = false;

  async function tick(): Promise<void> {
    if (running) return;
    running = true;
    try {
      const expired = await expireSanctions(sequelize);
      for (const sanction of expired) {
        await safetyLog.record({
          eventType: 'sanction.expired',
          severity: 'info',
          userId: sanction.userId,
          metadata: { sanctionId: sanction.sanctionId, type: sanction.type },
        });
      }
    } catch (err) {
      logger.error({ err }, 'Sanction expiry job failed');
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
