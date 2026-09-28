import type { MigrationFn } from 'umzug';
import type { MigrationContext } from '../config/umzug.js';
import { runInTransaction } from '../lib/migration-helpers.js';

/**
 * Append-only record of admin actions (docs/architecture/security-architecture.md §11).
 * A trigger rejects UPDATE and DELETE, so entries cannot be altered through the application.
 */
export const up: MigrationFn<MigrationContext> = async ({ context: { sequelize } }) => {
  await runInTransaction(sequelize, [
    `CREATE TABLE admin_audit_logs (
       id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
       admin_id     uuid NOT NULL REFERENCES admin_users (id) ON DELETE RESTRICT,
       action       varchar(60) NOT NULL,
       target_type  varchar(30) NOT NULL,
       target_id    uuid,
       metadata     jsonb NOT NULL DEFAULT '{}'::jsonb,
       ip_hash      char(64),
       created_at   timestamptz NOT NULL DEFAULT now(),

       CONSTRAINT admin_audit_logs_action_format_check CHECK (action ~ '^[a-z_]+(\\.[a-z_]+)+$'),
       CONSTRAINT admin_audit_logs_target_type_check
         CHECK (target_type IN ('user', 'admin', 'report', 'event', 'verification', 'photo', 'city', 'area', 'sanction')),
       CONSTRAINT admin_audit_logs_ip_hash_format_check
         CHECK (ip_hash IS NULL OR ip_hash ~ '^[0-9a-f]{64}$')
     )`,

    `CREATE INDEX admin_audit_logs_created_at_idx ON admin_audit_logs (created_at DESC)`,
    `CREATE INDEX admin_audit_logs_admin_id_created_at_idx ON admin_audit_logs (admin_id, created_at DESC)`,
    `CREATE INDEX admin_audit_logs_target_idx ON admin_audit_logs (target_type, target_id)`,

    `CREATE OR REPLACE FUNCTION reject_audit_log_changes() RETURNS trigger LANGUAGE plpgsql AS $$
     BEGIN
       RAISE EXCEPTION 'admin_audit_logs is append-only';
     END;
     $$`,
    `CREATE TRIGGER admin_audit_logs_append_only BEFORE UPDATE OR DELETE ON admin_audit_logs
       FOR EACH ROW EXECUTE FUNCTION reject_audit_log_changes()`,

    `COMMENT ON TABLE admin_audit_logs IS 'Append-only admin action log. metadata never contains phone numbers, OTPs, passwords or tokens.'`,
  ]);
};

export const down: MigrationFn<MigrationContext> = async ({ context: { sequelize } }) => {
  await runInTransaction(sequelize, [
    `DROP TABLE IF EXISTS admin_audit_logs`,
    `DROP FUNCTION IF EXISTS reject_audit_log_changes()`,
  ]);
};
