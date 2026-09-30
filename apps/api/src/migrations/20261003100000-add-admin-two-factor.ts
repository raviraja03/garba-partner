import type { MigrationFn } from 'umzug';
import type { MigrationContext } from '../config/umzug.js';
import { runInTransaction } from '../lib/migration-helpers.js';

/**
 * Mandatory admin two-factor sign-in (docs/security/security-best-practices.md).
 *
 * - `admin_users.totp_secret_encrypted`: the authenticator secret, AES-256-GCM with
 *   TOTP_ENCRYPTION_KEY (never stored in plain text); `totp_enabled_at`; `totp_last_step`
 *   (the last accepted 30-second step, so a code can never be replayed).
 * - `admin_login_challenges`: the short-lived second step after a correct password. Only a
 *   SHA-256 hash of the challenge token is stored. `setup` challenges hold the pending
 *   (encrypted) secret until the first code confirms it.
 */
export const up: MigrationFn<MigrationContext> = async ({ context: { sequelize } }) => {
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

    // A super admin resetting someone's authenticator ends their sessions.
    `ALTER TABLE admin_sessions DROP CONSTRAINT admin_sessions_revoked_reason_check`,
    `ALTER TABLE admin_sessions ADD CONSTRAINT admin_sessions_revoked_reason_check CHECK (
       revoked_reason IS NULL
       OR revoked_reason IN ('logout', 'reuse_detected', 'idle_timeout', 'disabled', 'two_factor_reset'))`,
  ]);
};

export const down: MigrationFn<MigrationContext> = async ({ context: { sequelize } }) => {
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
