import type { MigrationFn } from 'umzug';
import type { MigrationContext } from '../config/umzug.js';
import { runInTransaction } from '../lib/migration-helpers.js';

/**
 * Identity verification through an external provider (docs/safety/identity-verification.md).
 * The table still stores ONLY metadata: user, type, provider, provider reference, status,
 * verified_at and failure reason — never document numbers, images or KYC payloads.
 */
export const up: MigrationFn<MigrationContext> = async ({ context: { sequelize } }) => {
  await runInTransaction(sequelize, [
    `ALTER TABLE user_verifications ADD COLUMN verified_at timestamptz`,
    `UPDATE user_verifications SET verified_at = decided_at WHERE status = 'approved'`,
    `ALTER TABLE user_verifications
       ADD CONSTRAINT user_verifications_verified_at_check CHECK (
         (status <> 'approved' OR verified_at IS NOT NULL)
         AND (verified_at IS NULL OR status IN ('approved', 'revoked'))
       )`,

    // mock_kyc = development-only simulated provider. Real providers are added after legal review.
    `ALTER TABLE user_verifications DROP CONSTRAINT user_verifications_provider_check`,
    `ALTER TABLE user_verifications ADD CONSTRAINT user_verifications_provider_check
       CHECK (provider IN ('internal_review', 'mock_kyc'))`,

    `ALTER TABLE user_verifications DROP CONSTRAINT user_verifications_failure_reason_check`,
    `ALTER TABLE user_verifications ADD CONSTRAINT user_verifications_failure_reason_check CHECK (
       failure_reason IS NULL OR failure_reason IN (
         'gesture_mismatch', 'face_not_visible', 'does_not_match_photos', 'inappropriate',
         'age_below_18', 'document_invalid', 'name_mismatch', 'user_cancelled',
         'provider_failed', 'other'
       )
     )`,

    // Cached projection of an approved identity verification (like photo_verified_at).
    `ALTER TABLE users ADD COLUMN identity_verified_at timestamptz`,

    `COMMENT ON COLUMN user_verifications.verified_at IS 'When the verification was approved. Kept after revocation for audit.'`,
  ]);
};

export const down: MigrationFn<MigrationContext> = async ({ context: { sequelize } }) => {
  await runInTransaction(sequelize, [
    `ALTER TABLE users DROP COLUMN identity_verified_at`,
    `DELETE FROM user_verifications WHERE provider = 'mock_kyc'`,
    `ALTER TABLE user_verifications DROP CONSTRAINT user_verifications_failure_reason_check`,
    `UPDATE user_verifications SET failure_reason = 'other'
       WHERE failure_reason IN ('age_below_18', 'document_invalid', 'name_mismatch', 'user_cancelled')`,
    `ALTER TABLE user_verifications ADD CONSTRAINT user_verifications_failure_reason_check CHECK (
       failure_reason IS NULL OR failure_reason IN
         ('gesture_mismatch', 'face_not_visible', 'does_not_match_photos', 'inappropriate',
          'provider_failed', 'other')
     )`,
    `ALTER TABLE user_verifications DROP CONSTRAINT user_verifications_provider_check`,
    `ALTER TABLE user_verifications ADD CONSTRAINT user_verifications_provider_check
       CHECK (provider IN ('internal_review'))`,
    `ALTER TABLE user_verifications DROP CONSTRAINT user_verifications_verified_at_check`,
    `ALTER TABLE user_verifications DROP COLUMN verified_at`,
  ]);
};
