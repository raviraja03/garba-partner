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
} as const satisfies Record<string, { httpStatus: number; message: string }>;

export type ErrorCode = keyof typeof ERROR_CODES;

export function isErrorCode(value: unknown): value is ErrorCode {
  return typeof value === 'string' && Object.hasOwn(ERROR_CODES, value);
}
