/**
 * Business limits (docs/architecture/application-architecture.md §9).
 * Only the limits used by implemented features live here; the rest are added with their phase.
 */
export const LIMITS = {
  MIN_AGE: 18,
  PREF_AGE_MIN: 18,
  PREF_AGE_MAX: 80,
  DISPLAY_NAME_MIN: 2,
  DISPLAY_NAME_MAX: 30,
  BIO_MAX_LENGTH: 300,

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
} as const;
