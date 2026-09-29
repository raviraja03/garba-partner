/**
 * Business limits (docs/architecture/application-architecture.md §9).
 * Only the limits used by implemented features live here; the rest are added with their phase.
 */
export const LIMITS = {
  MIN_AGE: 18,
  MAX_AGE: 100,
  PREF_AGE_MIN: 18,
  PREF_AGE_MAX: 80,
  DISPLAY_NAME_MIN: 2,
  DISPLAY_NAME_MAX: 30,
  BIO_MAX_LENGTH: 300,
  INSTAGRAM_HANDLE_MAX: 30,
  AVAILABLE_DATES_MAX: 30,
  /** Available dates must be within this many days from today (IST). */
  AVAILABLE_DATES_HORIZON_DAYS: 365,

  // Profile image (docs/users/cloudinary.md)
  PROFILE_IMAGE_MAX_BYTES: 5 * 1024 * 1024,
  PROFILE_IMAGE_MIN_DIMENSION: 400,
  PROFILE_IMAGE_MAX_DIMENSION: 8000,
  PROFILE_IMAGE_UPLOADS_PER_HOUR: 20,

  // Member OTP login (docs/auth/otp-flow.md)
  OTP_LENGTH: 6,
  OTP_TTL_SECONDS: 300,
  OTP_MAX_ATTEMPTS: 5,
  OTP_RESEND_COOLDOWN_SECONDS: 30,
  OTP_MAX_PER_PHONE_PER_HOUR: 5,
  OTP_MAX_PER_PHONE_PER_DAY: 10,
  OTP_MAX_PER_IP_PER_HOUR: 20,

  // Sessions (docs/auth/session-management.md)
  REFRESH_REUSE_GRACE_SECONDS: 15,

  // Admin login
  ADMIN_MAX_FAILED_LOGINS: 5,
  ADMIN_LOCKOUT_MINUTES: 15,
  ADMIN_PASSWORD_MIN_LENGTH: 12,

  // Identity verification (docs/safety/identity-verification.md)
  IDENTITY_VERIFICATION_STARTS_PER_DAY: 3,
  IDENTITY_SESSION_TTL_MINUTES: 30,
  VERIFICATION_WEBHOOK_TOLERANCE_SECONDS: 300,

  // Safety (docs/safety/reporting.md, docs/safety/blocking.md)
  REPORTS_PER_DAY: 10,
  REPORT_DETAILS_MAX_LENGTH: 1000,
  BLOCKS_PER_HOUR: 30,
  AUTO_HIDE_REPORT_THRESHOLD: 3,
  AUTO_HIDE_WINDOW_DAYS: 7,
  ADMIN_RESOLUTION_NOTE_MIN: 5,
  ADMIN_RESOLUTION_NOTE_MAX: 2000,

  // Events and organizers (docs/events/event-management.md)
  EVENT_NAME_MIN: 3,
  EVENT_NAME_MAX: 120,
  EVENT_DESCRIPTION_MIN: 10,
  EVENT_DESCRIPTION_MAX: 5000,
  EVENT_VENUE_NAME_MAX: 150,
  EVENT_VENUE_ADDRESS_MAX: 300,
  /** Events can be scheduled at most this many days ahead. */
  EVENT_MAX_DAYS_AHEAD: 730,
  EVENT_URL_MAX: 500,
  EVENT_PAGE_SIZE_DEFAULT: 12,
  EVENT_PAGE_SIZE_MAX: 50,
  PUBLIC_EVENT_REQUESTS_PER_MINUTE: 120,
  ORGANIZER_NAME_MIN: 2,
  ORGANIZER_NAME_MAX: 150,
  ORGANIZER_DESCRIPTION_MAX: 1000,
  ORGANIZER_CONTACT_NAME_MAX: 100,
  ORGANIZER_NOTES_MAX: 2000,
  /** Active organizers returned by the admin picker. */
  ORGANIZER_OPTIONS_MAX: 500,

  // General API rate limit (per client IP)
  API_REQUESTS_PER_MINUTE: 300,

  // Admin lists
  ADMIN_PAGE_SIZE_DEFAULT: 20,
  ADMIN_PAGE_SIZE_MAX: 50,
  ADMIN_ACTION_REASON_MIN: 5,
  ADMIN_ACTION_REASON_MAX: 500,
} as const;

/** Accepted upload types; the server verifies by decoding, not by trusting this header. */
export const PROFILE_IMAGE_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;

/** Current Terms of Service / Privacy Policy version accepted during onboarding. */
export const CURRENT_TERMS_VERSION = '2026-09-01';

/** Business dates (age, "today") are evaluated in India Standard Time. */
export const BUSINESS_TIME_ZONE = 'Asia/Kolkata';
