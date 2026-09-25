import type { MigrationFn } from 'umzug';
import type { MigrationContext } from '../config/umzug.js';
import { runInTransaction, updatedAtTrigger } from '../lib/migration-helpers.js';

// Values are deliberately hard-coded (not imported from @garba-partner/shared): a migration is a
// historical snapshot and must not change behaviour when shared constants evolve.

export const up: MigrationFn<MigrationContext> = async ({ context: { sequelize } }) => {
  await runInTransaction(sequelize, [
    // Keeps updated_at correct even for raw SQL updates.
    `CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger LANGUAGE plpgsql AS $$
     BEGIN
       NEW.updated_at = now();
       RETURN NEW;
     END;
     $$`,

    `CREATE TABLE users (
       id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
       phone_hash              char(64),
       phone_encrypted         text,
       phone_key_version       smallint,
       status                  varchar(20) NOT NULL DEFAULT 'active',
       onboarding_completed_at timestamptz,
       underage_rejected_at    timestamptz,
       photo_verified_at       timestamptz,
       hidden_from_discovery   boolean NOT NULL DEFAULT false,
       hidden_reason           varchar(30),
       terms_version           varchar(20),
       terms_accepted_at       timestamptz,
       last_active_at          timestamptz,
       deletion_requested_at   timestamptz,
       created_at              timestamptz NOT NULL DEFAULT now(),
       updated_at              timestamptz NOT NULL DEFAULT now(),
       deleted_at              timestamptz,

       CONSTRAINT users_status_check
         CHECK (status IN ('active', 'suspended', 'banned', 'pending_deletion')),
       CONSTRAINT users_phone_hash_format_check
         CHECK (phone_hash IS NULL OR phone_hash ~ '^[0-9a-f]{64}$'),
       CONSTRAINT users_phone_key_version_check
         CHECK (phone_key_version IS NULL OR phone_key_version >= 1),
       -- Live accounts always have phone data; soft-deleted (erased) accounts never do.
       CONSTRAINT users_phone_lifecycle_check CHECK (
         (deleted_at IS NULL
           AND phone_hash IS NOT NULL AND phone_encrypted IS NOT NULL AND phone_key_version IS NOT NULL)
         OR
         (deleted_at IS NOT NULL
           AND phone_hash IS NULL AND phone_encrypted IS NULL AND phone_key_version IS NULL)
       ),
       CONSTRAINT users_hidden_reason_check
         CHECK (hidden_reason IS NULL OR hidden_reason IN ('p0_report', 'report_threshold', 'no_visible_photo')),
       CONSTRAINT users_hidden_consistency_check
         CHECK (hidden_from_discovery = (hidden_reason IS NOT NULL)),
       CONSTRAINT users_terms_consistency_check
         CHECK ((terms_version IS NULL) = (terms_accepted_at IS NULL)),
       CONSTRAINT users_pending_deletion_check
         CHECK (status <> 'pending_deletion' OR deletion_requested_at IS NOT NULL)
     )`,

    `CREATE UNIQUE INDEX users_phone_hash_unique ON users (phone_hash) WHERE phone_hash IS NOT NULL`,
    `CREATE INDEX users_status_idx ON users (status) WHERE deleted_at IS NULL`,
    `CREATE INDEX users_deletion_requested_at_idx ON users (deletion_requested_at)
       WHERE status = 'pending_deletion'`,

    updatedAtTrigger('users'),

    `COMMENT ON TABLE users IS 'Accounts. Soft-deleted via deleted_at (phone data must be nulled at the same time).'`,
    `COMMENT ON COLUMN users.phone_hash IS 'HMAC-SHA256 of the E.164 phone number (hex). Never the number itself.'`,
    `COMMENT ON COLUMN users.phone_encrypted IS 'AES-256-GCM ciphertext; audited break-glass access only.'`,
  ]);
};

export const down: MigrationFn<MigrationContext> = async ({ context: { sequelize } }) => {
  await runInTransaction(sequelize, [
    `DROP TABLE IF EXISTS users`,
    `DROP FUNCTION IF EXISTS set_updated_at()`,
  ]);
};
