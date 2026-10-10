import { QueryTypes } from 'sequelize';
import type { Sequelize } from 'sequelize-typescript';
import type { Logger } from 'pino';
import { sanitizeLogText } from '../../lib/log-sanitize.js';
import { metaMessageRef } from '../../providers/meta/index.js';

/** The delivery outcomes Meta reports that this app tracks (`played` and others are ignored). */
const TRACKED = ['sent', 'delivered', 'read', 'failed'] as const;
type TrackedStatus = (typeof TRACKED)[number];

export interface StatusUpdate {
  /** Meta's message ID (`wamid…`). Never stored or logged as is: see `metaMessageRef`. */
  messageId: string;
  status: TrackedStatus;
  at: Date;
  /** Why it failed, already cleaned for storage. */
  error: string | null;
}

export interface WebhookResult {
  /** Status entries found for our number. */
  received: number;
  /** Rows that actually changed (duplicates and out-of-order reports change nothing). */
  applied: number;
}

export interface WhatsAppWebhookService {
  /** Applies every status report in a verified webhook body. Safe to call twice with the same body. */
  handle(body: unknown): Promise<WebhookResult>;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const list = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);

/**
 * Pulls the status reports out of a webhook body. Everything else Meta sends on the same
 * subscription (incoming messages, other phone numbers of the account, statuses we do not
 * track) is ignored. Unknown shapes are skipped, never trusted.
 */
export function parseStatusUpdates(body: unknown, phoneNumberId: string): StatusUpdate[] {
  if (!isRecord(body) || body.object !== 'whatsapp_business_account') return [];
  const updates: StatusUpdate[] = [];
  for (const entry of list(body.entry)) {
    for (const change of list(isRecord(entry) ? entry.changes : null)) {
      if (!isRecord(change) || change.field !== 'messages' || !isRecord(change.value)) continue;
      const { value } = change;
      // One Meta app can serve several numbers: only reports for OUR sending number count.
      const metadata = isRecord(value.metadata) ? value.metadata : {};
      if (metadata.phone_number_id !== phoneNumberId) continue;

      for (const item of list(value.statuses)) {
        if (!isRecord(item) || typeof item.id !== 'string' || item.id.length > 512) continue;
        const status = TRACKED.find((known) => known === item.status);
        if (!status) continue;
        const seconds = Number(item.timestamp);
        const at = Number.isFinite(seconds) && seconds > 0 ? new Date(seconds * 1000) : new Date();
        updates.push({ messageId: item.id, status, at, error: errorOf(item.errors) });
      }
    }
  }
  return updates;
}

/** `[E131026] Message undeliverable — <details>`, with numbers and emails masked. */
function errorOf(errors: unknown): string | null {
  const first: unknown = list(errors)[0];
  if (!isRecord(first)) return null;
  const data = isRecord(first.error_data) ? first.error_data : {};
  const text = [first.title, data.details]
    .filter((part): part is string => typeof part === 'string' && part.length > 0)
    .join(' — ');
  const code = typeof first.code === 'number' ? `[E${String(first.code)}] ` : '';
  return `${code}${sanitizeLogText(text || 'Delivery failed', 280)}`.slice(0, 300);
}

/**
 * A status only ever moves forward: pending → sent → delivered → read, with `failed` between
 * sent and delivered. That makes reports safe in any order and any number of times: a duplicate
 * or a late "sent" simply matches no row.
 */
const RANK = `CASE %s WHEN 'pending' THEN 0 WHEN 'sent' THEN 1 WHEN 'failed' THEN 2
                      WHEN 'delivered' THEN 3 WHEN 'read' THEN 4 ELSE 0 END`;
const rank = (expression: string) => RANK.replace('%s', expression);

export function createWhatsAppWebhookService(deps: {
  sequelize: Sequelize;
  /** `META_WHATSAPP_PHONE_NUMBER_ID`: reports for any other number are ignored. */
  phoneNumberId: string;
  logger: Logger;
}): WhatsAppWebhookService {
  const { sequelize, phoneNumberId, logger } = deps;

  async function apply(update: StatusUpdate): Promise<number> {
    const replacements = {
      ref: metaMessageRef(update.messageId),
      status: update.status,
      at: update.at,
      error: update.status === 'failed' ? (update.error ?? 'Delivery failed') : null,
    };
    const notifications = await sequelize.query<{ id: string }>(
      `UPDATE notification_deliveries
          SET status = :status,
              sent_at      = CASE WHEN :status = 'sent' THEN COALESCE(sent_at, :at) ELSE sent_at END,
              delivered_at = CASE WHEN :status IN ('delivered', 'read')
                                  THEN COALESCE(delivered_at, :at) ELSE delivered_at END,
              read_at      = CASE WHEN :status = 'read' THEN :at ELSE read_at END,
              failed_at    = CASE WHEN :status = 'failed' THEN :at ELSE failed_at END,
              error_message = CASE WHEN :status = 'failed' THEN :error ELSE error_message END
        WHERE provider = 'meta' AND provider_message_id = :ref
          AND ${rank('status')} < ${rank(':status')}
        RETURNING id`,
      { type: QueryTypes.SELECT, replacements },
    );
    const codes = await sequelize.query<{ id: string }>(
      `UPDATE otp_requests
          SET delivery_status = :status,
              delivery_error = CASE WHEN :status = 'failed' THEN :error ELSE delivery_error END,
              delivery_updated_at = :at
        WHERE provider_message_id = :ref
          AND ${rank("COALESCE(delivery_status, 'pending')")} < ${rank(':status')}
        RETURNING id`,
      { type: QueryTypes.SELECT, replacements },
    );
    return notifications.length + codes.length;
  }

  return {
    async handle(body) {
      const updates = parseStatusUpdates(body, phoneNumberId);
      let applied = 0;
      const counts: Partial<Record<TrackedStatus, number>> = {};
      for (const update of updates) {
        const changed = await apply(update);
        applied += changed;
        if (changed > 0) counts[update.status] = (counts[update.status] ?? 0) + changed;
        if (changed > 0 && update.status === 'failed') {
          // The reason only: no message ID (it embeds the number) and no recipient.
          logger.warn(`[WHATSAPP] status=FAILED | error=${update.error ?? 'Delivery failed'}`);
        }
      }
      if (updates.length > 0) {
        logger.info(
          { received: updates.length, applied, ...counts },
          `[WHATSAPP] webhook | received=${String(updates.length)} | applied=${String(applied)}`,
        );
      }
      return { received: updates.length, applied };
    },
  };
}
