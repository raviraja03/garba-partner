import type { MigrationFn } from 'umzug';
import type { MigrationContext } from '../config/umzug.js';
import { runInTransaction } from '../lib/migration-helpers.js';

/**
 * Delivery tracking for the Meta WhatsApp Cloud API (docs/notifications/meta-whatsapp.md).
 *
 * 1. `notification_deliveries`: Meta reports `read` as well, so that status is allowed and each
 *    outcome gets its own timestamp.
 * 2. `otp_requests`: remembers which WhatsApp message carried the code and what became of it
 *    (sent, delivered, read, failed), so "the code never arrived" can be explained. The code
 *    itself is still never stored: only its HMAC, as before.
 * 3. `notification_preferences`: `whatsapp_opt_in`. WhatsApp requires a member's consent before
 *    a business messages them, so it is OFF until they turn it on. Login codes are not affected:
 *    the member asks for those themselves.
 *
 * `provider_message_id` holds a SHA-256 of Meta's message ID, not the ID: Meta's IDs embed the
 * recipient's phone number, which this database never stores in readable form.
 *
 * Nothing is dropped. Existing rows (including history with `provider = 'msg91'`) are untouched.
 */
export const up: MigrationFn<MigrationContext> = async ({ context: { sequelize } }) => {
  await runInTransaction(sequelize, [
    `ALTER TABLE notification_deliveries
       DROP CONSTRAINT notification_deliveries_status_check,
       ADD CONSTRAINT notification_deliveries_status_check
         CHECK (status IN ('pending', 'sent', 'delivered', 'read', 'failed')),
       ADD COLUMN read_at    timestamptz,
       ADD COLUMN failed_at  timestamptz`,

    `ALTER TABLE otp_requests
       ADD COLUMN provider_message_id  varchar(120),
       ADD COLUMN delivery_status      varchar(20),
       ADD COLUMN delivery_error       varchar(300),
       ADD COLUMN delivery_updated_at  timestamptz,
       ADD CONSTRAINT otp_requests_delivery_status_check
         CHECK (delivery_status IS NULL OR delivery_status IN ('sent', 'delivered', 'read', 'failed'))`,
    // Delivery reports arrive by message ID.
    `CREATE INDEX otp_requests_provider_message_idx ON otp_requests (provider_message_id)
       WHERE provider_message_id IS NOT NULL`,

    `ALTER TABLE notification_preferences
       ADD COLUMN whatsapp_opt_in     boolean NOT NULL DEFAULT false,
       ADD COLUMN whatsapp_opt_in_at  timestamptz`,

    `COMMENT ON COLUMN otp_requests.provider_message_id IS 'SHA-256 of the provider message ID (Meta IDs embed the phone number). Never the code.'`,
    `COMMENT ON COLUMN notification_preferences.whatsapp_opt_in IS 'Consent to receive notifications on WhatsApp. Off until the member turns it on.'`,
  ]);
};

export const down: MigrationFn<MigrationContext> = async ({ context: { sequelize } }) => {
  await runInTransaction(sequelize, [
    `ALTER TABLE notification_preferences
       DROP COLUMN IF EXISTS whatsapp_opt_in_at,
       DROP COLUMN IF EXISTS whatsapp_opt_in`,
    `DROP INDEX IF EXISTS otp_requests_provider_message_idx`,
    `ALTER TABLE otp_requests
       DROP CONSTRAINT IF EXISTS otp_requests_delivery_status_check,
       DROP COLUMN IF EXISTS delivery_updated_at,
       DROP COLUMN IF EXISTS delivery_error,
       DROP COLUMN IF EXISTS delivery_status,
       DROP COLUMN IF EXISTS provider_message_id`,
    // The older constraint has no "read": those rows were, at least, delivered.
    `UPDATE notification_deliveries SET status = 'delivered' WHERE status = 'read'`,
    `ALTER TABLE notification_deliveries
       DROP CONSTRAINT notification_deliveries_status_check,
       ADD CONSTRAINT notification_deliveries_status_check
         CHECK (status IN ('pending', 'sent', 'delivered', 'failed')),
       DROP COLUMN IF EXISTS failed_at,
       DROP COLUMN IF EXISTS read_at`,
  ]);
};
