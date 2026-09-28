/**
 * Canonical API error codes with their HTTP status and default user-facing message.
 * Domain-specific codes (auth, interests, chat, ...) are added in the phase that introduces them.
 * See docs/architecture/application-architecture.md §4.5.
 */
export const ERROR_CODES = {
  VALIDATION_ERROR: { httpStatus: 400, message: 'Some of the information provided is invalid.' },
  UNAUTHENTICATED: { httpStatus: 401, message: 'Please log in to continue.' },
  FORBIDDEN: { httpStatus: 403, message: 'You do not have permission to do this.' },
  NOT_FOUND: { httpStatus: 404, message: 'The requested resource was not found.' },
  CONFLICT: { httpStatus: 409, message: 'This request conflicts with the current state.' },
  PAYLOAD_TOO_LARGE: { httpStatus: 413, message: 'The request is too large.' },
  RATE_LIMITED: { httpStatus: 429, message: 'Too many requests. Please try again later.' },
  INTERNAL_ERROR: { httpStatus: 500, message: 'Something went wrong. Please try again.' },
  SERVICE_UNAVAILABLE: { httpStatus: 503, message: 'The service is temporarily unavailable.' },

  // Authentication (docs/auth/authentication.md)
  OTP_INVALID: { httpStatus: 400, message: 'That code is not correct. Please try again.' },
  OTP_EXPIRED: { httpStatus: 400, message: 'That code has expired. Please request a new one.' },
  OTP_ATTEMPTS_EXCEEDED: {
    httpStatus: 400,
    message: 'Too many incorrect attempts. Please request a new code.',
  },
  REFRESH_INVALID: { httpStatus: 401, message: 'Your session has ended. Please log in again.' },
  INVALID_CREDENTIALS: { httpStatus: 401, message: 'Incorrect email or password.' },
  ACCOUNT_LOCKED: {
    httpStatus: 423,
    message: 'Too many failed attempts. Please try again later.',
  },
  ACCOUNT_SUSPENDED: { httpStatus: 403, message: 'Your account is currently suspended.' },
  ACCOUNT_BANNED: {
    httpStatus: 403,
    message:
      'This account has been permanently banned. Contact support if you think this is a mistake.',
  },
  ACCOUNT_PENDING_DELETION: { httpStatus: 403, message: 'This account is scheduled for deletion.' },

  // Profiles (docs/users/user-profile.md)
  UNDERAGE: { httpStatus: 403, message: 'Garba Partner is only for adults (18+).' },
  ONBOARDING_REQUIRED: { httpStatus: 403, message: 'Please complete your profile first.' },
  PROFILE_NOT_STARTED: { httpStatus: 409, message: 'Please create your profile first.' },
  INVALID_IMAGE: {
    httpStatus: 400,
    message: 'Please upload a JPEG, PNG or WebP photo of at least 400×400 pixels.',
  },
} as const satisfies Record<string, { httpStatus: number; message: string }>;

export type ErrorCode = keyof typeof ERROR_CODES;

export function isErrorCode(value: unknown): value is ErrorCode {
  return typeof value === 'string' && Object.hasOwn(ERROR_CODES, value);
}
