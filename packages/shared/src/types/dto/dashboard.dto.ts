/**
 * Admin dashboard (docs/admin/dashboard.md). Aggregates only: no names, phone numbers or other
 * member data. Each section is `null` when the admin's role lacks the permission behind it.
 */
export interface DashboardPeriodDto {
  /** Inclusive IST dates. */
  from: string;
  to: string;
  cityId: string | null;
  generatedAt: string;
}

export interface AdminDashboardSummaryDto {
  period: DashboardPeriodDto;
  /** `users:view`. `total`, `verified`, `suspended`, `banned`, `active*` are current snapshots. */
  users: {
    total: number;
    newInPeriod: number;
    /** Signed in or used the app in the last 7 / 30 days (as of now). */
    active7d: number;
    active30d: number;
    /** Active accounts with a photo or identity check. Not a safety guarantee. */
    verified: number;
    suspended: number;
    banned: number;
  } | null;
  /** `events:view` */
  events: {
    published: number;
    /** Published events taking place in the period. */
    inPeriod: number;
    upcoming: number;
  } | null;
  /** `users:view` */
  matches: {
    createdInPeriod: number;
    active: number;
  } | null;
  /** `reports:manage` */
  reports: {
    /** Open or in review, now. */
    pending: number;
    /** Pending P0 (threats, under 18). */
    pendingUrgent: number;
    openedInPeriod: number;
  } | null;
  /** `payments:view` */
  bookings: {
    confirmedInPeriod: number;
    passesSoldInPeriod: number;
    cancelledInPeriod: number;
  } | null;
  /** `payments:view`. Paise. Gross = captured in period; refunds = refunded in period. */
  revenue: {
    grossPaise: number;
    refundedPaise: number;
    netPaise: number;
    currency: 'INR';
  } | null;
}

/**
 * Daily (or weekly, for ranges over 92 days) series for the charts. A series is `null` when the
 * admin lacks its permission. `labels[i]` is the IST date that bucket starts on.
 */
export interface AdminDashboardTrendsDto {
  period: DashboardPeriodDto;
  interval: 'day' | 'week';
  labels: string[];
  series: {
    signups: number[] | null;
    matches: number[] | null;
    reports: number[] | null;
    bookings: number[] | null;
    revenuePaise: number[] | null;
  };
}

/** Per-event activity (`GET /api/v1/admin/dashboard/events`). Sales fields need `payments:view`. */
export interface AdminDashboardEventRowDto {
  id: string;
  name: string;
  eventDate: string;
  city: string;
  status: 'published' | 'archived';
  going: number;
  interested: number;
  lookingForPartner: number;
  matches: number;
  sales: {
    pricePaise: number | null;
    capacity: number | null;
    bookings: number;
    passesSold: number;
    grossPaise: number;
    refundedPaise: number;
  } | null;
}
