/**
 * Domain enumerations shared by the API (validation, models) and the frontends (forms, labels).
 * Database CHECK constraints mirror these values; changing one requires a migration
 * (see docs/database/migration-guide.md).
 */

/** Account lifecycle. Soft-deleted accounts are marked with `users.deleted_at`, not a status. */
export const USER_STATUSES = ['active', 'suspended', 'banned', 'pending_deletion'] as const;
export type UserStatus = (typeof USER_STATUSES)[number];

/** Why a user is hidden from discovery pending moderator review. */
export const HIDDEN_REASONS = ['p0_report', 'report_threshold', 'no_visible_photo'] as const;
export type HiddenReason = (typeof HIDDEN_REASONS)[number];

export const GENDERS = ['woman', 'man', 'non_binary'] as const;
export type Gender = (typeof GENDERS)[number];

export const PARTNER_GENDER_PREFERENCES = ['women', 'men', 'everyone'] as const;
export type PartnerGenderPreference = (typeof PARTNER_GENDER_PREFERENCES)[number];

export const EXPERIENCE_LEVELS = ['beginner', 'intermediate', 'advanced'] as const;
export type ExperienceLevel = (typeof EXPERIENCE_LEVELS)[number];

export const DANCE_STYLES = ['garba', 'dandiya_raas'] as const;
export type DanceStyle = (typeof DANCE_STYLES)[number];

export const SESSION_REVOKE_REASONS = [
  'logout',
  'logout_all',
  'reuse_detected',
  'sanction',
  'deletion',
] as const;
export type SessionRevokeReason = (typeof SESSION_REVOKE_REASONS)[number];

/** `photo` is the MVP moderator-reviewed selfie check; `government_id` is reserved (post-MVP). */
export const VERIFICATION_TYPES = ['photo', 'government_id'] as const;
export type VerificationType = (typeof VERIFICATION_TYPES)[number];

/**
 * Who performed a verification. New external providers require legal review and a migration
 * that extends the database CHECK constraint.
 */
export const VERIFICATION_PROVIDERS = ['internal_review'] as const;
export type VerificationProvider = (typeof VERIFICATION_PROVIDERS)[number];

export const VERIFICATION_STATUSES = [
  'initiated',
  'pending',
  'approved',
  'rejected',
  'expired',
  'revoked',
] as const;
export type VerificationStatus = (typeof VERIFICATION_STATUSES)[number];

/** Verifications in these states block a new request of the same type. */
export const OPEN_VERIFICATION_STATUSES = [
  'initiated',
  'pending',
] as const satisfies readonly VerificationStatus[];

export const VERIFICATION_FAILURE_REASONS = [
  'gesture_mismatch',
  'face_not_visible',
  'does_not_match_photos',
  'inappropriate',
  'provider_failed',
  'other',
] as const;
export type VerificationFailureReason = (typeof VERIFICATION_FAILURE_REASONS)[number];
