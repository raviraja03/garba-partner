import type { MigrationFn } from 'umzug';
import type { MigrationContext } from '../config/umzug.js';
import { runInTransaction } from '../lib/migration-helpers.js';

/**
 * Suspicious-activity log (docs/safety/privacy.md#suspicious-activity-logging). Append-only.
 * `user_id` / `admin_id` are plain references WITHOUT foreign keys: log rows must survive
 * account erasure and must never be modified (an FK with SET NULL would be an UPDATE).
 * `metadata` never contains phone numbers, OTPs, message text, tokens or raw IP addresses.
 */
export const up: MigrationFn<MigrationContext> = async ({ context: { sequelize } }) => {
  await runInTransaction(sequelize, [
    `CREATE TABLE safety_logs (
       id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
       event_type  varchar(60) NOT NULL,
       severity    varchar(10) NOT NULL,
       user_id     uuid,
       admin_id    uuid,
       ip_hash     char(64),
       metadata    jsonb NOT NULL DEFAULT '{}'::jsonb,
       created_at  timestamptz NOT NULL DEFAULT now(),

       CONSTRAINT safety_logs_event_type_format_check CHECK (event_type ~ '^[a-z_]+(\\.[a-z_]+)+$'),
       CONSTRAINT safety_logs_severity_check CHECK (severity IN ('info', 'warning', 'critical')),
       CONSTRAINT safety_logs_ip_hash_format_check CHECK (ip_hash IS NULL OR ip_hash ~ '^[0-9a-f]{64}$')
     )`,

    `CREATE INDEX safety_logs_created_at_idx ON safety_logs (created_at DESC)`,
    `CREATE INDEX safety_logs_user_id_created_at_idx ON safety_logs (user_id, created_at DESC)
       WHERE user_id IS NOT NULL`,
    `CREATE INDEX safety_logs_event_type_created_at_idx ON safety_logs (event_type, created_at DESC)`,
    `CREATE INDEX safety_logs_critical_idx ON safety_logs (created_at DESC) WHERE severity = 'critical'`,

    `CREATE OR REPLACE FUNCTION reject_append_only_changes() RETURNS trigger LANGUAGE plpgsql AS $$
     BEGIN
       RAISE EXCEPTION '% is append-only', TG_TABLE_NAME;
     END;
     $$`,
    `CREATE TRIGGER safety_logs_append_only BEFORE UPDATE OR DELETE ON safety_logs
       FOR EACH ROW EXECUTE FUNCTION reject_append_only_changes()`,
  ]);
};

export const down: MigrationFn<MigrationContext> = async ({ context: { sequelize } }) => {
  await runInTransaction(sequelize, [
    `DROP TABLE IF EXISTS safety_logs`,
    `DROP FUNCTION IF EXISTS reject_append_only_changes()`,
  ]);
};
