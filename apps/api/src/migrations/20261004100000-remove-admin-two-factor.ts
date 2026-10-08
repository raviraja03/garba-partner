import type { MigrationFn } from 'umzug';
import type { MigrationContext } from '../config/umzug.js';
import { runInTransaction } from '../lib/migration-helpers.js';

/**
 * Removes admin two-factor (authenticator/TOTP) sign-in, added by
 * `20261003100000-add-admin-two-factor`, which is kept because it may already have run.
 * Admins now sign in with email + password only (docs/auth/authentication.md).
 *
 * Drops `admin_login_challenges` and the `admin_users.totp_*` columns (stored authenticator
 * secrets are deleted), and removes the `two_factor_reset` session revoke reason (existing rows
 * become `disabled`, the closest remaining reason). `down` recreates the empty structure.
 */
export const up: MigrationFn<MigrationContext> = async ({ context: { sequelize } }) => {
  await runInTransaction(sequelize, [
    `ALTER TABLE admin_sessions DROP CONSTRAINT admin_sessions_revoked_reason_check`,
    `UPDATE admin_sessions SET revoked_reason = 'disabled' WHERE revoked_reason = 'two_factor_reset'`,
    `ALTER TABLE admin_sessions ADD CONSTRAINT admin_sessions_revoked_reason_check CHECK (
       revoked_reason IS NULL
       OR revoked_reason IN ('logout', 'reuse_detected', 'idle_timeout', 'disabled'))`,

    `DROP TABLE IF EXISTS admin_login_challenges`,

    `ALTER TABLE admin_users
       DROP CONSTRAINT IF EXISTS admin_users_totp_consistency_check,
       DROP COLUMN IF EXISTS totp_last_step,
       DROP COLUMN IF EXISTS totp_enabled_at,
       DROP COLUMN IF EXISTS totp_secret_encrypted`,
  ]);
};

export const down: MigrationFn<MigrationContext> = async ({ context: { sequelize } }) => {
  await runInTransaction(sequelize, [
    `ALTER TABLE admin_users
       ADD COLUMN totp_secret_encrypted text,
       ADD COLUMN totp_enabled_at timestamptz,
       ADD COLUMN totp_last_step bigint,
       ADD CONSTRAINT admin_users_totp_consistency_check
         CHECK ((totp_secret_encrypted IS NULL) = (totp_enabled_at IS NULL))`,

    `CREATE TABLE admin_login_challenges (
       id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
       admin_id               uuid NOT NULL REFERENCES admin_users (id) ON DELETE CASCADE,
       token_hash             char(64) NOT NULL,
       purpose                varchar(10) NOT NULL,
       pending_secret_encrypted text,
       attempts               smallint NOT NULL DEFAULT 0,
       expires_at             timestamptz NOT NULL,
       consumed_at            timestamptz,
       created_at             timestamptz NOT NULL DEFAULT now(),

       CONSTRAINT admin_login_challenges_purpose_check CHECK (purpose IN ('totp', 'setup')),
       CONSTRAINT admin_login_challenges_token_hash_unique UNIQUE (token_hash),
       CONSTRAINT admin_login_challenges_attempts_check CHECK (attempts BETWEEN 0 AND 10),
       CONSTRAINT admin_login_challenges_pending_secret_check
         CHECK (purpose = 'setup' OR pending_secret_encrypted IS NULL)
     )`,
    `CREATE INDEX admin_login_challenges_admin_id_idx ON admin_login_challenges (admin_id)`,
    `CREATE INDEX admin_login_challenges_expires_at_idx ON admin_login_challenges (expires_at)`,

    `ALTER TABLE admin_sessions DROP CONSTRAINT admin_sessions_revoked_reason_check`,
    `ALTER TABLE admin_sessions ADD CONSTRAINT admin_sessions_revoked_reason_check CHECK (
       revoked_reason IS NULL
       OR revoked_reason IN ('logout', 'reuse_detected', 'idle_timeout', 'disabled', 'two_factor_reset'))`,
  ]);
};
