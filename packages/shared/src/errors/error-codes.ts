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
  UNDERAGE: { httpStatus: 403, message: 'GarbaMates is only for adults (18+).' },
  ONBOARDING_REQUIRED: { httpStatus: 403, message: 'Please complete your profile first.' },
  PROFILE_NOT_STARTED: { httpStatus: 409, message: 'Please create your profile first.' },
  VERIFICATION_UNAVAILABLE: {
    httpStatus: 503,
    message: 'Identity verification is not available right now.',
  },
  INVALID_IMAGE: {
    httpStatus: 400,
    message: 'Please upload a JPEG, PNG or WebP photo of at least 400×400 pixels.',
  },

  // Events & discovery (docs/matching/discovery.md)
  EVENT_NOT_OPEN: { httpStatus: 409, message: 'This event is not open for attendance.' },
  PARTNER_TOGGLE_REQUIRED: {
    httpStatus: 409,
    message: "Turn on 'Looking for a partner' for this event to see who else is.",
  },

  // Interests & matches (docs/matching/interests.md)
  /** Generic on purpose: never reveals a block, report, decline or sanction. */
  USER_UNAVAILABLE: { httpStatus: 404, message: 'This member is not available.' },
  DISCOVERY_DISABLED: {
    httpStatus: 403,
    message: 'Turn on discovery in your preferences to send interests.',
  },
  INTERACTIONS_RESTRICTED: {
    httpStatus: 403,
    message:
      "You can't send or accept interests right now. Contact support if you think this is a mistake.",
  },
  INTEREST_LIMIT_REACHED: {
    httpStatus: 429,
    message: "You've sent a lot of interests today. Please try again tomorrow.",
  },
  INTEREST_NOT_PENDING: { httpStatus: 409, message: 'This interest is no longer pending.' },
  ALREADY_MATCHED: { httpStatus: 409, message: 'You have already matched with this member.' },

  // Chat (docs/chat/architecture.md)
  /** The match ended (unmatch, block, report, moderation) or the other member is unavailable. */
  MATCH_NOT_ACTIVE: { httpStatus: 409, message: 'This chat is no longer available.' },
  /** A moderator restricted this member from sending messages (docs/safety/admin-actions.md). */
  CHAT_RESTRICTED: {
    httpStatus: 403,
    message:
      "You can't send messages right now because of a restriction on your account. See the notice in the app for details.",
  },

  // Payments (docs/payments/payment-flow.md)
  PAYMENTS_UNAVAILABLE: {
    httpStatus: 503,
    message: 'Online pass sales are not available right now.',
  },
  PASSES_NOT_ON_SALE: { httpStatus: 409, message: 'Passes for this event are not on sale.' },
  SOLD_OUT: { httpStatus: 409, message: 'Not enough passes are left for this event.' },
  ORDER_EXPIRED: {
    httpStatus: 409,
    message: 'This order has expired. Please start again.',
  },
  IDEMPOTENCY_CONFLICT: {
    httpStatus: 409,
    message: 'This request key was already used for a different order.',
  },
  PAYMENT_VERIFICATION_FAILED: {
    httpStatus: 400,
    message: 'We could not verify this payment. If money was deducted, it will be refunded.',
  },
  PAYMENT_PROVIDER_ERROR: {
    httpStatus: 502,
    message: 'The payment service is not responding. Please try again.',
  },
} as const satisfies Record<string, { httpStatus: number; message: string }>;

export type ErrorCode = keyof typeof ERROR_CODES;

export function isErrorCode(value: unknown): value is ErrorCode {
  return typeof value === 'string' && Object.hasOwn(ERROR_CODES, value);
}
