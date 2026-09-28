import type { MigrationFn } from 'umzug';
import type { MigrationContext } from '../config/umzug.js';
import { runInTransaction, updatedAtTrigger } from '../lib/migration-helpers.js';

export const up: MigrationFn<MigrationContext> = async ({ context: { sequelize } }) => {
  await runInTransaction(sequelize, [
    // Admin identities are completely separate from member accounts.
    `CREATE TABLE admin_users (
       id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
       email               varchar(254) NOT NULL,
       name                varchar(100) NOT NULL,
       role                varchar(20) NOT NULL,
       password_hash       text NOT NULL,
       status              varchar(20) NOT NULL DEFAULT 'active',
       failed_login_count  smallint NOT NULL DEFAULT 0,
       locked_until        timestamptz,
       last_login_at       timestamptz,
       created_at          timestamptz NOT NULL DEFAULT now(),
       updated_at          timestamptz NOT NULL DEFAULT now(),

       CONSTRAINT admin_users_email_unique UNIQUE (email),
       CONSTRAINT admin_users_email_lowercase_check CHECK (email = lower(email)),
       CONSTRAINT admin_users_name_check CHECK (char_length(btrim(name)) >= 1),
       CONSTRAINT admin_users_role_check
         CHECK (role IN ('super_admin', 'moderator', 'event_manager')),
       CONSTRAINT admin_users_status_check CHECK (status IN ('active', 'disabled')),
       CONSTRAINT admin_users_password_hash_check CHECK (password_hash LIKE '$argon2id$%'),
       CONSTRAINT admin_users_failed_login_count_check CHECK (failed_login_count >= 0)
     )`,

    `CREATE TABLE admin_sessions (
       id                           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
       admin_id                     uuid NOT NULL REFERENCES admin_users (id) ON DELETE CASCADE,
       refresh_token_hash           char(64) NOT NULL,
       previous_refresh_token_hash  char(64),
       rotated_at                   timestamptz,
       user_agent                   varchar(255),
       ip_hash                      char(64),
       last_used_at                 timestamptz NOT NULL DEFAULT now(),
       expires_at                   timestamptz NOT NULL,
       revoked_at                   timestamptz,
       revoked_reason               varchar(30),
       created_at                   timestamptz NOT NULL DEFAULT now(),
       updated_at                   timestamptz NOT NULL DEFAULT now(),

       CONSTRAINT admin_sessions_refresh_token_hash_unique UNIQUE (refresh_token_hash),
       CONSTRAINT admin_sessions_hash_format_check CHECK (
         refresh_token_hash ~ '^[0-9a-f]{64}$'
         AND (previous_refresh_token_hash IS NULL OR previous_refresh_token_hash ~ '^[0-9a-f]{64}$')
         AND (ip_hash IS NULL OR ip_hash ~ '^[0-9a-f]{64}$')
       ),
       CONSTRAINT admin_sessions_rotation_consistency_check
         CHECK ((previous_refresh_token_hash IS NULL) = (rotated_at IS NULL)),
       CONSTRAINT admin_sessions_expiry_check CHECK (expires_at > created_at),
       CONSTRAINT admin_sessions_revoked_reason_check CHECK (
         revoked_reason IS NULL
         OR revoked_reason IN ('logout', 'reuse_detected', 'idle_timeout', 'disabled')
       ),
       CONSTRAINT admin_sessions_revocation_consistency_check
         CHECK ((revoked_at IS NULL) = (revoked_reason IS NULL))
     )`,

    `CREATE INDEX admin_sessions_active_admin_id_idx ON admin_sessions (admin_id) WHERE revoked_at IS NULL`,
    `CREATE INDEX admin_sessions_previous_refresh_token_hash_idx ON admin_sessions (previous_refresh_token_hash)
       WHERE previous_refresh_token_hash IS NOT NULL`,
    `CREATE INDEX admin_sessions_expires_at_idx ON admin_sessions (expires_at)`,

    // Verification decisions now reference the reviewing admin (admins are disabled, never deleted).
    `ALTER TABLE user_verifications
       ADD CONSTRAINT user_verifications_reviewed_by_admin_id_fkey
       FOREIGN KEY (reviewed_by_admin_id) REFERENCES admin_users (id) ON DELETE RESTRICT`,
    `CREATE INDEX user_verifications_reviewed_by_admin_id_idx ON user_verifications (reviewed_by_admin_id)
       WHERE reviewed_by_admin_id IS NOT NULL`,

    updatedAtTrigger('admin_users'),
    updatedAtTrigger('admin_sessions'),

    `COMMENT ON TABLE admin_users IS 'Admin panel identities (separate from members). Disabled, never deleted.'`,
    `COMMENT ON COLUMN admin_users.password_hash IS 'Argon2id hash (PHC string).'`,
  ]);
};

export const down: MigrationFn<MigrationContext> = async ({ context: { sequelize } }) => {
  await runInTransaction(sequelize, [
    `DROP INDEX IF EXISTS user_verifications_reviewed_by_admin_id_idx`,
    `ALTER TABLE user_verifications DROP CONSTRAINT IF EXISTS user_verifications_reviewed_by_admin_id_fkey`,
    `DROP TABLE IF EXISTS admin_sessions`,
    `DROP TABLE IF EXISTS admin_users`,
  ]);
};
