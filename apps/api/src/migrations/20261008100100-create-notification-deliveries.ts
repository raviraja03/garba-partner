import type { MigrationFn } from 'umzug';
import type { MigrationContext } from '../config/umzug.js';
import { runInTransaction, updatedAtTrigger } from '../lib/migration-helpers.js';

/**
 * Delivery history for notifications sent outside the app (docs/notifications/notification-channels.md).
 *
 * The existing `notifications` table is the member's in-app list (and holds `read_at`). This
 * table records every attempt to deliver one of those notifications over a channel: one row
 * per notification and channel, whether it was sent or failed.
 *
 * - `reference_key` is unique: the same notification is never sent twice over the same channel,
 *   whatever retries (API retries, job reruns, a second process).
 * - `recipient` is the masked phone number (`+91XXXXXX3210`), never the full number.
 * - `message` is fixed wording chosen by type. It never contains chat text, names of other
 *   members, contact details or locations.
 * - `channel` and `status` are checked text, so adding a channel later is a one-line migration.
 */
export const up: MigrationFn<MigrationContext> = async ({ context: { sequelize } }) => {
  await runInTransaction(sequelize, [
    `CREATE TABLE notification_deliveries (
       id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
       user_id              uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
       notification_id      uuid REFERENCES notifications (id) ON DELETE SET NULL,
       notification_type    varchar(30) NOT NULL,
       title                varchar(120) NOT NULL,
       message              varchar(500) NOT NULL,
       channel              varchar(20) NOT NULL,
       recipient            varchar(20) NOT NULL,
       status               varchar(20) NOT NULL DEFAULT 'pending',
       provider             varchar(40) NOT NULL,
       provider_message_id  varchar(120),
       error_message        varchar(300),
       reference_key        varchar(120) NOT NULL,
       sent_at              timestamptz,
       delivered_at         timestamptz,
       created_at           timestamptz NOT NULL DEFAULT now(),
       updated_at           timestamptz NOT NULL DEFAULT now(),

       CONSTRAINT notification_deliveries_channel_check CHECK (channel IN ('sms', 'whatsapp')),
       CONSTRAINT notification_deliveries_status_check
         CHECK (status IN ('pending', 'sent', 'delivered', 'failed')),
       CONSTRAINT notification_deliveries_failed_has_error_check
         CHECK (status <> 'failed' OR error_message IS NOT NULL)
     )`,

    // Idempotency: one attempt per notification and channel.
    `CREATE UNIQUE INDEX notification_deliveries_reference_key_unique
       ON notification_deliveries (reference_key)`,
    // A member's delivery history (newest first).
    `CREATE INDEX notification_deliveries_user_created_idx
       ON notification_deliveries (user_id, created_at DESC)`,
    // Monitoring: failures and stuck sends per channel.
    `CREATE INDEX notification_deliveries_status_created_idx
       ON notification_deliveries (channel, status, created_at DESC)`,
    // Delivery receipts from a provider arrive by its message ID.
    `CREATE INDEX notification_deliveries_provider_message_idx
       ON notification_deliveries (provider, provider_message_id)
       WHERE provider_message_id IS NOT NULL`,
    `CREATE INDEX notification_deliveries_notification_idx
       ON notification_deliveries (notification_id) WHERE notification_id IS NOT NULL`,
    updatedAtTrigger('notification_deliveries'),

    `COMMENT ON COLUMN notification_deliveries.recipient IS 'Masked phone number only (+91XXXXXX3210). Never the full number.'`,
  ]);
};

export const down: MigrationFn<MigrationContext> = async ({ context: { sequelize } }) => {
  await runInTransaction(sequelize, [`DROP TABLE IF EXISTS notification_deliveries`]);
};
