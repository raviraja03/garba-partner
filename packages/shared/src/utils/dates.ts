import { BUSINESS_TIME_ZONE, LIMITS } from '../constants/limits.js';

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** True for a real calendar date written as `YYYY-MM-DD` (rejects 2026-02-30). */
export function isIsoDate(value: string): boolean {
  const match = ISO_DATE.exec(value);
  if (!match) return false;
  const [, y, m, d] = match.map(Number);
  if (y === undefined || m === undefined || d === undefined) return false;
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

/** Today's date (`YYYY-MM-DD`) in India Standard Time. */
export function todayInIndia(now: Date = new Date()): string {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: BUSINESS_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

/** Adds whole days to a `YYYY-MM-DD` date. */
export function addDays(isoDate: string, days: number): string {
  const date = new Date(`${isoDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** Age in completed years on `today` (both `YYYY-MM-DD`). */
export function calculateAge(dateOfBirth: string, today: string): number {
  const [by = 0, bm = 0, bd = 0] = dateOfBirth.split('-').map(Number);
  const [ty = 0, tm = 0, td = 0] = today.split('-').map(Number);
  let age = ty - by;
  if (tm < bm || (tm === bm && td < bd)) age -= 1;
  return age;
}

/** True when the person born on `dateOfBirth` is at least 18 on `today`. */
export function isAdult(dateOfBirth: string, today: string): boolean {
  return calculateAge(dateOfBirth, today) >= LIMITS.MIN_AGE;
}

/**
 * Checks a list of available dates against `today`: each must be a real date between today and
 * the horizon. Returns a user-facing error message, or null when valid.
 */
export function availableDatesError(dates: readonly string[], today: string): string | null {
  if (dates.length > LIMITS.AVAILABLE_DATES_MAX) {
    return `Choose at most ${String(LIMITS.AVAILABLE_DATES_MAX)} dates.`;
  }
  const horizon = addDays(today, LIMITS.AVAILABLE_DATES_HORIZON_DAYS);
  for (const date of dates) {
    if (!isIsoDate(date)) return 'Dates must be valid calendar dates.';
    if (date < today) return 'Available dates cannot be in the past.';
    if (date > horizon) return 'Available dates must be within the next 12 months.';
  }
  if (new Set(dates).size !== dates.length) return 'Each date can only be added once.';
  return null;
}
