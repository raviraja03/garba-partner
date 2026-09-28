import type { MigrationFn } from 'umzug';
import type { MigrationContext } from '../config/umzug.js';
import { runInTransaction, updatedAtTrigger } from '../lib/migration-helpers.js';

export const up: MigrationFn<MigrationContext> = async ({ context: { sequelize } }) => {
  await runInTransaction(sequelize, [
    `CREATE TABLE otp_requests (
       id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
       phone_hash      char(64) NOT NULL,
       otp_hash        char(64) NOT NULL,
       attempts        smallint NOT NULL DEFAULT 0,
       expires_at      timestamptz NOT NULL,
       consumed_at     timestamptz,
       invalidated_at  timestamptz,
       ip_hash         char(64) NOT NULL,
       created_at      timestamptz NOT NULL DEFAULT now(),
       updated_at      timestamptz NOT NULL DEFAULT now(),

       CONSTRAINT otp_requests_hash_format_check CHECK (
         phone_hash ~ '^[0-9a-f]{64}$' AND otp_hash ~ '^[0-9a-f]{64}$' AND ip_hash ~ '^[0-9a-f]{64}$'
       ),
       CONSTRAINT otp_requests_attempts_check CHECK (attempts BETWEEN 0 AND 20),
       CONSTRAINT otp_requests_expiry_check CHECK (expires_at > created_at),
       CONSTRAINT otp_requests_single_outcome_check
         CHECK (consumed_at IS NULL OR invalidated_at IS NULL)
     )`,

    // At most one usable code per phone: issuing a new code must invalidate the previous one.
    `CREATE UNIQUE INDEX otp_requests_one_active_per_phone_unique ON otp_requests (phone_hash)
       WHERE consumed_at IS NULL AND invalidated_at IS NULL`,
    // Rate-limit windows (per phone, per IP) and the purge job.
    `CREATE INDEX otp_requests_phone_hash_created_at_idx ON otp_requests (phone_hash, created_at DESC)`,
    `CREATE INDEX otp_requests_ip_hash_created_at_idx ON otp_requests (ip_hash, created_at DESC)`,
    `CREATE INDEX otp_requests_created_at_idx ON otp_requests (created_at)`,

    updatedAtTrigger('otp_requests'),

    `COMMENT ON TABLE otp_requests IS 'One-time login codes. Only HMACs are stored; codes are never persisted or logged.'`,
  ]);
};

export const down: MigrationFn<MigrationContext> = async ({ context: { sequelize } }) => {
  await runInTransaction(sequelize, [`DROP TABLE IF EXISTS otp_requests`]);
};
