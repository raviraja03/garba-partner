import { addDays, BUSINESS_TIME_ZONE, todayInIndia } from '@garba-partner/shared';

/** Date filter presets on the events page. */
export const DATE_PRESETS = ['upcoming', 'today', 'weekend', 'week', 'date'] as const;
export type DatePreset = (typeof DATE_PRESETS)[number];

export const DATE_PRESET_LABELS: Record<DatePreset, string> = {
  upcoming: 'All upcoming',
  today: 'Today',
  weekend: 'This weekend',
  week: 'Next 7 days',
  date: 'Pick a date',
};

/** 0 = Sunday … 6 = Saturday, for a `YYYY-MM-DD` calendar date. */
function weekday(isoDate: string): number {
  return new Date(`${isoDate}T00:00:00Z`).getUTCDay();
}

/** Converts a preset into an inclusive IST date range (null = unbounded). */
export function presetRange(
  preset: DatePreset,
  pickedDate: string | null,
  today: string = todayInIndia(),
): { from: string | null; to: string | null } {
  switch (preset) {
    case 'upcoming':
      return { from: null, to: null };
    case 'today':
      return { from: today, to: today };
    case 'week':
      return { from: today, to: addDays(today, 6) };
    case 'date':
      return pickedDate ? { from: pickedDate, to: pickedDate } : { from: null, to: null };
    case 'weekend': {
      const day = weekday(today);
      if (day === 0) return { from: today, to: today }; // Sunday: just today
      const saturday = addDays(today, 6 - day);
      return { from: day === 6 ? today : saturday, to: addDays(saturday, 1) };
    }
  }
}

/** `2026-10-12` → `Mon, 12 Oct 2026`. */
export function formatEventDate(isoDate: string): string {
  return new Intl.DateTimeFormat('en-IN', {
    timeZone: BUSINESS_TIME_ZONE,
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(new Date(`${isoDate}T12:00:00+05:30`));
}

/** `20:00` → `8:00 pm`. */
function formatTime(time: string): string {
  const [hours = 0, minutes = 0] = time.split(':').map(Number);
  const suffix = hours >= 12 ? 'pm' : 'am';
  const hour12 = hours % 12 === 0 ? 12 : hours % 12;
  return `${String(hour12)}:${String(minutes).padStart(2, '0')} ${suffix}`;
}

/** `20:00`–`01:00` → `8:00 pm – 1:00 am (next day)`. Times are IST. */
export function formatTimeRange(startTime: string, endTime: string): string {
  const overnight = endTime <= startTime;
  return `${formatTime(startTime)} – ${formatTime(endTime)}${overnight ? ' (next day)' : ''}`;
}

/** Only the host of an external link, shown so members know where "Get pass" leads. */
export function linkHost(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return null;
  }
}
