import type { MigrationFn } from 'umzug';
import type { MigrationContext } from '../config/umzug.js';
import { runInTransaction, updatedAtTrigger } from '../lib/migration-helpers.js';

export const up: MigrationFn<MigrationContext> = async ({ context: { sequelize } }) => {
  await runInTransaction(sequelize, [
    `CREATE TABLE user_sessions (
       id                           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
       user_id                      uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
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

       CONSTRAINT user_sessions_refresh_token_hash_unique UNIQUE (refresh_token_hash),
       CONSTRAINT user_sessions_hash_format_check CHECK (
         refresh_token_hash ~ '^[0-9a-f]{64}$'
         AND (previous_refresh_token_hash IS NULL OR previous_refresh_token_hash ~ '^[0-9a-f]{64}$')
         AND (ip_hash IS NULL OR ip_hash ~ '^[0-9a-f]{64}$')
       ),
       CONSTRAINT user_sessions_rotation_consistency_check
         CHECK ((previous_refresh_token_hash IS NULL) = (rotated_at IS NULL)),
       CONSTRAINT user_sessions_expiry_check CHECK (expires_at > created_at),
       CONSTRAINT user_sessions_revoked_reason_check CHECK (
         revoked_reason IS NULL
         OR revoked_reason IN ('logout', 'logout_all', 'reuse_detected', 'sanction', 'deletion')
       ),
       CONSTRAINT user_sessions_revocation_consistency_check
         CHECK ((revoked_at IS NULL) = (revoked_reason IS NULL))
     )`,

    `CREATE INDEX user_sessions_active_user_id_idx ON user_sessions (user_id) WHERE revoked_at IS NULL`,
    `CREATE INDEX user_sessions_previous_refresh_token_hash_idx ON user_sessions (previous_refresh_token_hash)
       WHERE previous_refresh_token_hash IS NOT NULL`,
    `CREATE INDEX user_sessions_expires_at_idx ON user_sessions (expires_at)`,

    updatedAtTrigger('user_sessions'),

    `COMMENT ON TABLE user_sessions IS 'One row per login. Only SHA-256 hashes of refresh tokens are stored.'`,
  ]);
};

export const down: MigrationFn<MigrationContext> = async ({ context: { sequelize } }) => {
  await runInTransaction(sequelize, [`DROP TABLE IF EXISTS user_sessions`]);
};
