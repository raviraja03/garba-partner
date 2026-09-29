import type { Logger } from 'pino';
import type { SafetyEventType, SafetySeverity } from '@garba-partner/shared';
import { hmacSha256Hex } from '../../lib/crypto.js';
import { SafetyLog } from '../../models/index.js';

export interface SafetyEvent {
  eventType: SafetyEventType;
  severity: SafetySeverity;
  userId?: string | null;
  adminId?: string | null;
  /** Raw client IP; only its HMAC is stored. */
  ip?: string | null;
  /** IDs, counts, reasons. NEVER phone numbers, OTPs, message text, tokens or raw IPs. */
  metadata?: Record<string, unknown>;
}

export interface SafetyLogger {
  /** Records an event. Never throws: logging must not break the request that triggered it. */
  record(event: SafetyEvent): Promise<void>;
}

/** Suspicious-activity logging (docs/safety/abuse-prevention.md#6-safety-logs). */
export function createSafetyLogger(deps: { ipHashSecret: string; logger: Logger }): SafetyLogger {
  return {
    async record(event) {
      try {
        await SafetyLog.create({
          eventType: event.eventType,
          severity: event.severity,
          userId: event.userId ?? null,
          adminId: event.adminId ?? null,
          ipHash: event.ip ? hmacSha256Hex(deps.ipHashSecret, `ip:${event.ip}`) : null,
          metadata: event.metadata ?? {},
        });
      } catch (err) {
        deps.logger.error({ err, eventType: event.eventType }, 'Failed to write safety log');
      }
      if (event.severity !== 'info') {
        deps.logger.warn(
          { eventType: event.eventType, severity: event.severity, userId: event.userId },
          'Safety event',
        );
      }
    },
  };
}
