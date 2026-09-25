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
} as const;
