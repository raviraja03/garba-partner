import { BUSINESS_TIME_ZONE } from '@garba-partner/shared';

export function formatDateTime(iso: string | null): string {
  return iso
    ? new Intl.DateTimeFormat('en-IN', {
        dateStyle: 'medium',
        timeStyle: 'short',
        timeZone: BUSINESS_TIME_ZONE,
      }).format(new Date(iso))
    : '—';
}

/** `2026-10-12` + `20:00`–`01:00` → `12 Oct 2026, 20:00–01:00 (+1 day) IST`. */
export function formatSchedule(eventDate: string, startTime: string, endTime: string): string {
  const date = new Intl.DateTimeFormat('en-IN', {
    dateStyle: 'medium',
    timeZone: BUSINESS_TIME_ZONE,
  }).format(new Date(`${eventDate}T12:00:00+05:30`));
  return `${date}, ${startTime}–${endTime}${endTime <= startTime ? ' (+1 day)' : ''} IST`;
}
