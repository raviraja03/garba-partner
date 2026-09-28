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

/** Self-declared Garba skill level. */
export const GARBA_LEVELS = ['beginner', 'intermediate', 'advanced'] as const;
export type GarbaLevel = (typeof GARBA_LEVELS)[number];

/**
 * Computed from the profile (never stored): `not_started` = no profile yet, `incomplete` = required
 * fields missing (e.g. no photo), `complete` = ready to be shown to other members.
 */
export const PROFILE_STATUSES = ['not_started', 'incomplete', 'complete'] as const;
export type ProfileStatus = (typeof PROFILE_STATUSES)[number];

export const SESSION_REVOKE_REASONS = [
  'logout',
  'logout_all',
  'reuse_detected',
  'sanction',
  'deletion',
] as const;
export type SessionRevokeReason = (typeof SESSION_REVOKE_REASONS)[number];

export const ADMIN_SESSION_REVOKE_REASONS = [
  'logout',
  'reuse_detected',
  'idle_timeout',
  'disabled',
] as const;
export type AdminSessionRevokeReason = (typeof ADMIN_SESSION_REVOKE_REASONS)[number];

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
