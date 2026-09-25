import type { MigrationFn } from 'umzug';
import type { MigrationContext } from '../config/umzug.js';
import { runInTransaction, updatedAtTrigger } from '../lib/migration-helpers.js';

export const up: MigrationFn<MigrationContext> = async ({ context: { sequelize } }) => {
  await runInTransaction(sequelize, [
    // Defence in depth against storing Aadhaar numbers: a standalone 12-digit number
    // (optionally grouped 4-4-4), first digit 2-9, valid Verhoeff checksum.
    // Mirrors apps/api/src/lib/pii-guards.ts.
    `CREATE OR REPLACE FUNCTION is_verhoeff_valid(digits text) RETURNS boolean
       LANGUAGE plpgsql IMMUTABLE STRICT AS $$
     DECLARE
       d int[] := ARRAY[
         0,1,2,3,4,5,6,7,8,9, 1,2,3,4,0,6,7,8,9,5, 2,3,4,0,1,7,8,9,5,6, 3,4,0,1,2,8,9,5,6,7,
         4,0,1,2,3,9,5,6,7,8, 5,9,8,7,6,0,4,3,2,1, 6,5,9,8,7,1,0,4,3,2, 7,6,5,9,8,2,1,0,4,3,
         8,7,6,5,9,3,2,1,0,4, 9,8,7,6,5,4,3,2,1,0];
       p int[] := ARRAY[
         0,1,2,3,4,5,6,7,8,9, 1,5,7,6,2,8,3,0,9,4, 5,8,0,3,7,9,6,1,4,2, 8,9,1,6,0,4,3,5,2,7,
         9,4,5,3,1,2,6,8,7,0, 4,2,8,6,5,7,3,9,0,1, 2,7,9,3,8,0,6,4,1,5, 7,0,4,6,9,1,3,2,5,8];
       c int := 0;
       n int := length(digits);
     BEGIN
       IF digits !~ '^[0-9]+$' THEN
         RETURN false;
       END IF;
       FOR i IN 0 .. n - 1 LOOP
         c := d[c * 10 + p[(i % 8) * 10 + substr(digits, n - i, 1)::int + 1] + 1];
       END LOOP;
       RETURN c = 0;
     END;
     $$`,

    `CREATE OR REPLACE FUNCTION contains_aadhaar_like_number(value text) RETURNS boolean
       LANGUAGE plpgsql IMMUTABLE STRICT AS $$
     DECLARE
       m text[];
     BEGIN
       FOR m IN
         SELECT regexp_matches(
           value,
           '(?:^|[^0-9A-Za-z])([2-9][0-9]{3})[ -]?([0-9]{4})[ -]?([0-9]{4})(?=[^0-9A-Za-z]|$)',
           'g')
       LOOP
         IF is_verhoeff_valid(m[1] || m[2] || m[3]) THEN
           RETURN true;
         END IF;
       END LOOP;
       RETURN false;
     END;
     $$`,

    `CREATE TABLE user_verifications (
       id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
       user_id                uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
       type                   varchar(20) NOT NULL,
       provider               varchar(40) NOT NULL,
       provider_reference     varchar(100),
       status                 varchar(20) NOT NULL DEFAULT 'initiated',
       challenge_code         varchar(40),
       evidence_reference     varchar(255),
       evidence_deleted_at    timestamptz,
       failure_reason         varchar(30),
       submitted_at           timestamptz,
       decided_at             timestamptz,
       expires_at             timestamptz,
       reviewed_by_admin_id   uuid,
       created_at             timestamptz NOT NULL DEFAULT now(),
       updated_at             timestamptz NOT NULL DEFAULT now(),

       CONSTRAINT user_verifications_type_check
         CHECK (type IN ('photo', 'government_id')),
       CONSTRAINT user_verifications_provider_check
         CHECK (provider IN ('internal_review')),
       -- Photo checks are reviewed internally; government ID checks require an external,
       -- licensed provider (none approved yet, so no government_id row can be inserted).
       CONSTRAINT user_verifications_type_provider_check CHECK (
         (type = 'photo' AND provider = 'internal_review')
         OR (type = 'government_id' AND provider <> 'internal_review')
       ),
       CONSTRAINT user_verifications_status_check
         CHECK (status IN ('initiated', 'pending', 'approved', 'rejected', 'expired', 'revoked')),
       CONSTRAINT user_verifications_challenge_code_check
         CHECK (challenge_code IS NULL OR challenge_code ~ '^[a-z0-9_]{1,40}$'),
       CONSTRAINT user_verifications_failure_reason_check CHECK (
         failure_reason IS NULL OR failure_reason IN
           ('gesture_mismatch', 'face_not_visible', 'does_not_match_photos', 'inappropriate',
            'provider_failed', 'other')
       ),
       CONSTRAINT user_verifications_rejection_consistency_check
         CHECK ((status = 'rejected') = (failure_reason IS NOT NULL)),
       CONSTRAINT user_verifications_decision_check
         CHECK (status NOT IN ('approved', 'rejected') OR decided_at IS NOT NULL),
       CONSTRAINT user_verifications_evidence_purge_check
         CHECK (evidence_deleted_at IS NULL OR evidence_reference IS NULL),
       CONSTRAINT user_verifications_no_identity_numbers_check CHECK (
         NOT coalesce(contains_aadhaar_like_number(provider_reference), false)
         AND NOT coalesce(contains_aadhaar_like_number(evidence_reference), false)
       )
     )`,

    // At most one open request per user and verification type.
    `CREATE UNIQUE INDEX user_verifications_one_open_per_type_unique
       ON user_verifications (user_id, type) WHERE status IN ('initiated', 'pending')`,
    `CREATE UNIQUE INDEX user_verifications_provider_reference_unique
       ON user_verifications (provider, provider_reference) WHERE provider_reference IS NOT NULL`,
    // Moderator review queue (oldest first).
    `CREATE INDEX user_verifications_review_queue_idx
       ON user_verifications (submitted_at) WHERE status = 'pending'`,
    `CREATE INDEX user_verifications_user_id_created_at_idx
       ON user_verifications (user_id, created_at DESC)`,
    // Evidence purge job.
    `CREATE INDEX user_verifications_evidence_purge_idx
       ON user_verifications (decided_at) WHERE evidence_reference IS NOT NULL`,

    updatedAtTrigger('user_verifications'),

    `COMMENT ON TABLE user_verifications IS 'Provider/reference/status metadata only. Never document numbers, images or KYC payloads.'`,
    `COMMENT ON COLUMN user_verifications.evidence_reference IS 'Opaque pointer to privately stored evidence; nulled when purged.'`,
  ]);
};

export const down: MigrationFn<MigrationContext> = async ({ context: { sequelize } }) => {
  await runInTransaction(sequelize, [
    `DROP TABLE IF EXISTS user_verifications`,
    `DROP FUNCTION IF EXISTS contains_aadhaar_like_number(text)`,
    `DROP FUNCTION IF EXISTS is_verhoeff_valid(text)`,
  ]);
};
