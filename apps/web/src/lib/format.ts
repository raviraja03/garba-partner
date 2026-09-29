import { BUSINESS_TIME_ZONE } from '@garba-partner/shared';

/** `2026-10-12` → `Mon, 12 Oct` (dates are calendar days in India Standard Time). */
export function formatShortDate(isoDate: string): string {
  return new Intl.DateTimeFormat('en-IN', {
    timeZone: BUSINESS_TIME_ZONE,
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  }).format(new Date(`${isoDate}T12:00:00+05:30`));
}

/** An ISO timestamp → `Mon, 12 Oct`, as the calendar day in India Standard Time. */
export function formatTimestampDay(isoTimestamp: string): string {
  return new Intl.DateTimeFormat('en-IN', {
    timeZone: BUSINESS_TIME_ZONE,
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  }).format(new Date(isoTimestamp));
}

/** `2000-03-14` → `14 March 2000`. */
export function formatLongDate(isoDate: string): string {
  return new Intl.DateTimeFormat('en-IN', {
    timeZone: BUSINESS_TIME_ZONE,
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date(`${isoDate}T12:00:00+05:30`));
}
