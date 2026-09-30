/**
 * Domain enumerations shared by the API (validation, models) and the frontends (forms, labels).
 * Database CHECK constraints mirror these values; changing one requires a migration
 * (see docs/database/migration-guide.md).
 */

/** Account lifecycle. Soft-deleted accounts are marked with `users.deleted_at`, not a status. */
export const USER_STATUSES = ['active', 'suspended', 'banned', 'pending_deletion'] as const;
export type UserStatus = (typeof USER_STATUSES)[number];

/** Why a user is hidden from discovery pending moderator review. */
export const HIDDEN_REASONS = [
  'p0_report',
  'report_threshold',
  'no_visible_photo',
  'suspicious_activity',
] as const;
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
  'two_factor_reset',
] as const;
export type AdminSessionRevokeReason = (typeof ADMIN_SESSION_REVOKE_REASONS)[number];

/** `photo` is the MVP moderator-reviewed selfie check; `government_id` is reserved (post-MVP). */
export const VERIFICATION_TYPES = ['photo', 'government_id'] as const;
export type VerificationType = (typeof VERIFICATION_TYPES)[number];

/**
 * Who performed a verification. `internal_review` = moderator photo check; `mock_kyc` =
 * development-only simulated identity provider. Real identity providers require legal review and
 * a migration that extends the database CHECK constraint (docs/safety/identity-verification.md).
 */
export const VERIFICATION_PROVIDERS = ['internal_review', 'mock_kyc'] as const;
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
  // Photo verification (moderator review)
  'gesture_mismatch',
  'face_not_visible',
  'does_not_match_photos',
  'inappropriate',
  // Identity verification (provider result)
  'age_below_18',
  'document_invalid',
  'name_mismatch',
  'user_cancelled',
  'provider_failed',
  'other',
] as const;
export type VerificationFailureReason = (typeof VERIFICATION_FAILURE_REASONS)[number];

// --- Safety ---------------------------------------------------------------------------------

/**
 * Report reasons, in the order shown to members. `underage` is kept on top of the product list
 * because the platform is 18+ and an under-18 member must always be reportable. Reasons are also
 * the guideline categories cited by warnings and sanctions (`COMMUNITY_GUIDELINES`).
 */
export const REPORT_REASONS = [
  'fake_profile',
  'harassment',
  'spam',
  'asking_for_money',
  'inappropriate_behavior',
  'threatening_behavior',
  'impersonation',
  'underage',
  'other',
] as const;
export type ReportReason = (typeof REPORT_REASONS)[number];

/** 0 = P0 (most urgent). See docs/safety/moderation-system.md#3-priorities. */
export const REPORT_PRIORITY_BY_REASON: Readonly<Record<ReportReason, 0 | 1 | 2>> = {
  threatening_behavior: 0,
  underage: 0,
  harassment: 1,
  asking_for_money: 1,
  inappropriate_behavior: 1,
  impersonation: 1,
  fake_profile: 2,
  spam: 2,
  other: 2,
};

export const REPORT_STATUSES = ['open', 'in_review', 'resolved', 'dismissed'] as const;
export type ReportStatus = (typeof REPORT_STATUSES)[number];

export const REPORT_SOURCES = ['member', 'system'] as const;
export type ReportSource = (typeof REPORT_SOURCES)[number];

export const REPORT_RESOLUTION_ACTIONS = [
  'dismiss',
  'warn',
  'restrict_chat',
  'suspend',
  'ban',
] as const;
export type ReportResolutionAction = (typeof REPORT_RESOLUTION_ACTIONS)[number];

export const SAFETY_SEVERITIES = ['info', 'warning', 'critical'] as const;
export type SafetySeverity = (typeof SAFETY_SEVERITIES)[number];

/** Suspicious-activity and safety events recorded in `safety_logs`. */
export const SAFETY_EVENT_TYPES = [
  'auth.otp_rate_limited',
  'auth.otp_attempts_exceeded',
  'auth.refresh_token_reuse',
  'admin.account_locked',
  'rate_limit.exceeded',
  'safety.block_created',
  'safety.block_removed',
  'safety.report_created',
  'safety.report_limit_reached',
  'safety.auto_hidden',
  'interest.limit_reached',
  'verification.start_limit_reached',
  'verification.webhook_rejected',
  'verification.underage_detected',
  'suspicious.money_requests',
  'suspicious.repeated_messages',
  'suspicious.frequently_blocked',
  'sanction.expired',
] as const;
export type SafetyEventType = (typeof SAFETY_EVENT_TYPES)[number];

/**
 * Patterns the platform flags automatically (docs/safety/abuse-prevention.md#4-suspicious-activity-detection).
 * A flag opens a `source = 'system'` report in the moderation queue. It NEVER bans or suspends
 * anyone: only a moderator applies sanctions.
 */
export const SUSPICIOUS_ACTIVITY_TRIGGERS = [
  'money_requests',
  'repeated_messages',
  'frequently_blocked',
] as const;
export type SuspiciousActivityTrigger = (typeof SUSPICIOUS_ACTIVITY_TRIGGERS)[number];

/**
 * Sanctions applied by moderators (docs/safety/admin-actions.md). `warning` = in-app notice the
 * member must acknowledge; `chat_restriction` = can't send messages; `suspension` = account
 * paused (optionally timed); `ban` = permanent removal. Never applied automatically.
 */
export const SANCTION_TYPES = ['warning', 'chat_restriction', 'suspension', 'ban'] as const;
export type SanctionType = (typeof SANCTION_TYPES)[number];

/** Allowed lengths for timed suspensions and chat restrictions (omit for "until lifted"). */
export const SANCTION_DURATION_DAYS = [1, 3, 7, 30] as const;
export type SanctionDurationDays = (typeof SANCTION_DURATION_DAYS)[number];

// --- Events (docs/events/event-management.md) ---------------------------------------------

/**
 * Event lifecycle. `draft` = not visible to members; `published` = listed publicly;
 * `archived` = soft-deleted (hidden everywhere, kept for history). "Ended" is derived from the
 * end time, never stored.
 */
export const EVENT_STATUSES = ['draft', 'published', 'archived'] as const;
export type EventStatus = (typeof EVENT_STATUSES)[number];

export const ORGANIZER_STATUSES = ['active', 'archived'] as const;
export type OrganizerStatus = (typeof ORGANIZER_STATUSES)[number];

/** Public event list ordering (by start time). */
export const EVENT_SORTS = ['date_asc', 'date_desc'] as const;
export type EventSort = (typeof EVENT_SORTS)[number];

/** Admin event list ordering. */
export const ADMIN_EVENT_SORTS = ['date_asc', 'date_desc', 'created_desc', 'name_asc'] as const;
export type AdminEventSort = (typeof ADMIN_EVENT_SORTS)[number];

// --- Attendance & discovery (docs/matching/discovery.md) -------------------------------------

/** A member's attendance at an event. */
export const ATTENDANCE_STATUSES = ['going', 'interested'] as const;
export type AttendanceStatus = (typeof ATTENDANCE_STATUSES)[number];

/**
 * Why a partner was suggested. Shown instead of a score: the ranking is a simple heuristic and
 * never a measure or guarantee of compatibility (docs/matching/matching-logic.md).
 */
export const MATCH_HIGHLIGHTS = [
  'same_event',
  'shared_dates',
  'same_city',
  'similar_age',
  'same_level',
  'verified',
] as const;
export type MatchHighlight = (typeof MATCH_HIGHLIGHTS)[number];

// --- Interests & matches (docs/matching/interests.md, docs/matching/matches.md) --------------

/**
 * `pending` → `accepted` (match created) | `declined` (receiver said no; the sender is never
 * told) | `withdrawn` (sender took it back) | `cancelled` (block, report, restriction or
 * ineligibility) | `expired` (no answer within `LIMITS.INTEREST_EXPIRY_DAYS`).
 */
export const INTEREST_STATUSES = [
  'pending',
  'accepted',
  'declined',
  'withdrawn',
  'cancelled',
  'expired',
] as const;
export type InterestStatus = (typeof INTEREST_STATUSES)[number];

/** `unmatched` = a member ended it; `blocked` = ended by a block; `closed` = report or moderation. */
export const MATCH_STATUSES = ['active', 'unmatched', 'blocked', 'closed'] as const;
export type MatchStatus = (typeof MATCH_STATUSES)[number];

/** The viewer's relationship with another member, as shown on a partner profile. */
export const CONNECTION_STATUSES = [
  'none',
  'interest_sent',
  'interest_received',
  'matched',
] as const;
export type ConnectionStatus = (typeof CONNECTION_STATUSES)[number];

// --- Notifications (docs/notifications/notifications.md) --------------------------------------

export const NOTIFICATION_TYPES = [
  'interest_received',
  'interest_accepted',
  'match_created',
  'new_message',
  'verification_completed',
  'event_reminder',
  'safety',
  /** Pass bookings: confirmation, cancellation and refunds (transactional, always on). */
  'booking',
] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

/** Types a member can turn off. Safety and booking notifications are always delivered. */
export const CONFIGURABLE_NOTIFICATION_TYPES = [
  'interest_received',
  'interest_accepted',
  'match_created',
  'new_message',
  'verification_completed',
  'event_reminder',
] as const satisfies readonly NotificationType[];
export type ConfigurableNotificationType = (typeof CONFIGURABLE_NOTIFICATION_TYPES)[number];

/** What a `safety` notification is about. Never names a reporter or includes moderator notes. */
export const SAFETY_NOTIFICATION_KINDS = [
  'warning_issued',
  'chat_restricted',
  'account_suspended',
  'restriction_lifted',
  'report_reviewed',
] as const;
export type SafetyNotificationKind = (typeof SAFETY_NOTIFICATION_KINDS)[number];

// --- Event passes & payments (docs/payments/payment-flow.md) ----------------------------------

/**
 * `created` = waiting for payment (seats reserved until `expires_at`); `paid` = a captured
 * payment was verified server-side; `expired` = no payment in time; `failed` = the payment
 * provider could not create the order.
 */
export const ORDER_STATUSES = ['created', 'paid', 'expired', 'failed'] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

/** Mirrors the Razorpay payment lifecycle as verified by the server. */
export const PAYMENT_STATUSES = [
  'created',
  'authorized',
  'captured',
  'failed',
  'refunded',
] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

export const BOOKING_STATUSES = ['confirmed', 'cancelled'] as const;
export type BookingStatus = (typeof BOOKING_STATUSES)[number];

/** `none` = not refunded; `pending` = requested at Razorpay; `processed` / `failed` = final. */
export const REFUND_STATUSES = ['none', 'pending', 'processed', 'failed'] as const;
export type RefundStatus = (typeof REFUND_STATUSES)[number];

/**
 * Why a booking was cancelled. `sold_out` / `event_unavailable` = the payment arrived after the
 * reservation lapsed and the passes were gone or the event closed: refunded automatically.
 */
export const BOOKING_CANCEL_REASONS = ['admin_refund', 'sold_out', 'event_unavailable'] as const;
export type BookingCancelReason = (typeof BOOKING_CANCEL_REASONS)[number];

/** What a `booking` notification is about. */
export const BOOKING_NOTIFICATION_KINDS = [
  'confirmed',
  'cancelled',
  'refund_processed',
  'refund_failed',
] as const;
export type BookingNotificationKind = (typeof BOOKING_NOTIFICATION_KINDS)[number];
