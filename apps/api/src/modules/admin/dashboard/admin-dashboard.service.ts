import { QueryTypes } from 'sequelize';
import type { Sequelize } from 'sequelize-typescript';
import {
  addDays,
  LIMITS,
  roleHasPermission,
  todayInIndia,
  type AdminDashboardEventRowDto,
  type AdminDashboardEventsQueryData,
  type AdminDashboardQueryData,
  type AdminDashboardSummaryDto,
  type AdminDashboardTrendsDto,
  type AdminRole,
  type DashboardPeriodDto,
  type PaginationMeta,
} from '@garba-partner/shared';
import { AppError } from '../../../lib/app-error.js';
import { City } from '../../../models/index.js';
import { istStartOfDay } from '../../events/events.service.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** A resolved filter: IST dates plus the UTC instants they cover (end exclusive). */
export interface DashboardPeriod {
  from: string;
  to: string;
  start: Date;
  end: Date;
  cityId: string | null;
}

export interface AdminDashboardService {
  summary(role: AdminRole, query: AdminDashboardQueryData): Promise<AdminDashboardSummaryDto>;
  trends(role: AdminRole, query: AdminDashboardQueryData): Promise<AdminDashboardTrendsDto>;
  events(
    role: AdminRole,
    query: AdminDashboardEventsQueryData,
  ): Promise<{ items: AdminDashboardEventRowDto[]; meta: PaginationMeta }>;
  /** All event rows for the period (capped), for the CSV export. */
  exportEvents(query: AdminDashboardQueryData): Promise<AdminDashboardEventRowDto[]>;
  resolvePeriod(query: AdminDashboardQueryData): Promise<DashboardPeriod>;
}

const invalid = (path: string, message: string) =>
  new AppError('VALIDATION_ERROR', { details: [{ path, message }] });

const daysBetween = (from: string, to: string) =>
  Math.round((Date.parse(to) - Date.parse(from)) / DAY_MS);

/** Monday on or before an IST date (Postgres `date_trunc('week')` weeks). */
function mondayOf(date: string): string {
  const weekday = new Date(`${date}T00:00:00Z`).getUTCDay(); // 0 = Sunday
  return addDays(date, -((weekday + 6) % 7));
}

// City filters, one per subject. `CAST(:cityId AS uuid) IS NULL` disables the filter.
const CITY_OF_USER = (column: string) => `(CAST(:cityId AS uuid) IS NULL OR EXISTS (
  SELECT 1 FROM user_profiles p WHERE p.user_id = ${column} AND p.city_id = CAST(:cityId AS uuid)))`;
const CITY_OF_EVENT = (column: string) =>
  `(CAST(:cityId AS uuid) IS NULL OR ${column} = CAST(:cityId AS uuid))`;

interface EventRow {
  id: string;
  name: string;
  event_date: string;
  status: 'published' | 'archived';
  city: string;
  pass_price_paise: number | null;
  pass_capacity: number | null;
  going: number;
  interested: number;
  looking: number;
  matches: number;
  bookings: number;
  passes_sold: number;
  gross: string | number;
  refunded: string | number;
}

/**
 * Operational dashboard (docs/admin/dashboard.md). Counts and sums only: no names, phone numbers,
 * messages or other member data. Each section is computed only if the admin's role holds the
 * permission behind it; otherwise it is `null` and its queries never run.
 */
export function createAdminDashboardService(deps: { sequelize: Sequelize }): AdminDashboardService {
  const { sequelize } = deps;

  async function select<T extends object>(sql: string, replacements: Record<string, unknown>) {
    return sequelize.query<T>(sql, { type: QueryTypes.SELECT, replacements });
  }

  async function resolvePeriod(query: AdminDashboardQueryData): Promise<DashboardPeriod> {
    const to = query.to ?? todayInIndia();
    const from = query.from ?? addDays(to, -(LIMITS.DASHBOARD_DEFAULT_RANGE_DAYS - 1));
    if (from > to) throw invalid('from', '"from" must be on or before "to".');
    if (daysBetween(from, to) + 1 > LIMITS.DASHBOARD_MAX_RANGE_DAYS) {
      throw invalid('from', 'Choose a range of at most one year.');
    }
    if (query.cityId && !(await City.findByPk(query.cityId, { attributes: ['id'] }))) {
      throw invalid('cityId', 'Unknown city.');
    }
    return {
      from,
      to,
      start: istStartOfDay(from),
      end: istStartOfDay(addDays(to, 1)),
      cityId: query.cityId ?? null,
    };
  }

  const periodDto = (p: DashboardPeriod): DashboardPeriodDto => ({
    from: p.from,
    to: p.to,
    cityId: p.cityId,
    generatedAt: new Date().toISOString(),
  });

  const params = (p: DashboardPeriod) => ({
    start: p.start,
    end: p.end,
    fromDate: p.from,
    toDate: p.to,
    cityId: p.cityId,
    now: new Date(),
  });

  async function users(p: DashboardPeriod) {
    const [row] = await select<NonNullable<AdminDashboardSummaryDto['users']>>(
      `SELECT count(*)::int AS "total",
              count(*) FILTER (WHERE u.created_at >= :start AND u.created_at < :end)::int AS "newInPeriod",
              count(*) FILTER (WHERE u.status = 'active'
                                 AND u.last_active_at >= CAST(:now AS timestamptz) - interval '7 days')::int AS "active7d",
              count(*) FILTER (WHERE u.status = 'active'
                                 AND u.last_active_at >= CAST(:now AS timestamptz) - interval '30 days')::int AS "active30d",
              count(*) FILTER (WHERE u.status = 'active'
                                 AND (u.photo_verified_at IS NOT NULL OR u.identity_verified_at IS NOT NULL))::int AS "verified",
              count(*) FILTER (WHERE u.status = 'suspended')::int AS "suspended",
              count(*) FILTER (WHERE u.status = 'banned')::int AS "banned"
         FROM users u
        WHERE u.deleted_at IS NULL AND ${CITY_OF_USER('u.id')}`,
      params(p),
    );
    return row ?? null;
  }

  async function events(p: DashboardPeriod) {
    const [row] = await select<NonNullable<AdminDashboardSummaryDto['events']>>(
      `SELECT count(*) FILTER (WHERE e.status = 'published')::int AS "published",
              count(*) FILTER (WHERE e.status = 'published'
                                 AND e.event_date BETWEEN :fromDate AND :toDate)::int AS "inPeriod",
              count(*) FILTER (WHERE e.status = 'published' AND e.starts_at > :now)::int AS "upcoming"
         FROM events e
        WHERE ${CITY_OF_EVENT('e.city_id')}`,
      params(p),
    );
    return row ?? null;
  }

  async function matches(p: DashboardPeriod) {
    const [row] = await select<NonNullable<AdminDashboardSummaryDto['matches']>>(
      `SELECT count(*) FILTER (WHERE m.created_at >= :start AND m.created_at < :end)::int AS "createdInPeriod",
              count(*) FILTER (WHERE m.status = 'active')::int AS "active"
         FROM matches m
        WHERE (${CITY_OF_USER('m.user_a_id')} OR ${CITY_OF_USER('m.user_b_id')})`,
      params(p),
    );
    return row ?? null;
  }

  async function reports(p: DashboardPeriod) {
    const [row] = await select<NonNullable<AdminDashboardSummaryDto['reports']>>(
      `SELECT count(*) FILTER (WHERE r.status IN ('open', 'in_review'))::int AS "pending",
              count(*) FILTER (WHERE r.status IN ('open', 'in_review') AND r.priority = 0)::int AS "pendingUrgent",
              count(*) FILTER (WHERE r.created_at >= :start AND r.created_at < :end)::int AS "openedInPeriod"
         FROM reports r
        WHERE ${CITY_OF_USER('r.reported_user_id')}`,
      params(p),
    );
    return row ?? null;
  }

  async function bookings(p: DashboardPeriod) {
    const [row] = await select<NonNullable<AdminDashboardSummaryDto['bookings']>>(
      `SELECT count(*) FILTER (WHERE b.status = 'confirmed'
                                 AND b.created_at >= :start AND b.created_at < :end)::int AS "confirmedInPeriod",
              COALESCE(sum(b.quantity) FILTER (WHERE b.status = 'confirmed'
                                 AND b.created_at >= :start AND b.created_at < :end), 0)::int AS "passesSoldInPeriod",
              count(*) FILTER (WHERE b.cancelled_at >= :start AND b.cancelled_at < :end)::int AS "cancelledInPeriod"
         FROM event_bookings b
         JOIN events e ON e.id = b.event_id
        WHERE ${CITY_OF_EVENT('e.city_id')}`,
      params(p),
    );
    return row ?? null;
  }

  async function revenue(p: DashboardPeriod): Promise<AdminDashboardSummaryDto['revenue']> {
    const [row] = await select<{ gross: string; refunded: string }>(
      `SELECT COALESCE(sum(pay.amount_paise) FILTER (
                WHERE pay.status IN ('captured', 'refunded')
                  AND pay.captured_at >= :start AND pay.captured_at < :end), 0)::bigint AS gross,
              COALESCE(sum(pay.amount_refunded_paise) FILTER (
                WHERE pay.refunded_at >= :start AND pay.refunded_at < :end), 0)::bigint AS refunded
         FROM payments pay
         JOIN orders o ON o.id = pay.order_id
         JOIN events e ON e.id = o.event_id
        WHERE ${CITY_OF_EVENT('e.city_id')}`,
      params(p),
    );
    const gross = Number(row?.gross ?? 0);
    const refunded = Number(row?.refunded ?? 0);
    return {
      grossPaise: gross,
      refundedPaise: refunded,
      netPaise: gross - refunded,
      currency: 'INR',
    };
  }

  /** Per-bucket values of one timestamp column, keyed by the bucket's IST start date. */
  async function bucketed(
    p: DashboardPeriod,
    unit: 'day' | 'week',
    sql: { value: string; from: string; at: string; where: string },
  ): Promise<Map<string, number>> {
    const rows = await select<{ bucket: string; value: string | number }>(
      `SELECT to_char(date_trunc('${unit}', ${sql.at} AT TIME ZONE 'Asia/Kolkata'), 'YYYY-MM-DD') AS bucket,
              ${sql.value} AS value
         FROM ${sql.from}
        WHERE ${sql.at} >= :start AND ${sql.at} < :end AND ${sql.where}
        GROUP BY 1`,
      params(p),
    );
    return new Map(rows.map((row) => [row.bucket, Number(row.value)]));
  }

  function toEventRow(row: EventRow, withSales: boolean): AdminDashboardEventRowDto {
    return {
      id: row.id,
      name: row.name,
      eventDate: row.event_date,
      city: row.city,
      status: row.status,
      going: row.going,
      interested: row.interested,
      lookingForPartner: row.looking,
      matches: row.matches,
      sales: withSales
        ? {
            pricePaise: row.pass_price_paise,
            capacity: row.pass_capacity,
            bookings: row.bookings,
            passesSold: row.passes_sold,
            grossPaise: Number(row.gross),
            refundedPaise: Number(row.refunded),
          }
        : null,
    };
  }

  async function eventRows(
    p: DashboardPeriod,
    page: { after: { date: string; id: string } | null; limit: number },
  ): Promise<EventRow[]> {
    return select<EventRow>(
      `SELECT e.id, e.name, to_char(e.event_date, 'YYYY-MM-DD') AS event_date, e.status,
              c.name AS city, e.pass_price_paise, e.pass_capacity,
              (SELECT count(*) FROM event_attendances a WHERE a.event_id = e.id AND a.status = 'going')::int AS going,
              (SELECT count(*) FROM event_attendances a WHERE a.event_id = e.id AND a.status = 'interested')::int AS interested,
              (SELECT count(*) FROM event_attendances a WHERE a.event_id = e.id AND a.looking_for_partner)::int AS looking,
              (SELECT count(*) FROM matches m WHERE m.event_id = e.id)::int AS matches,
              (SELECT count(*) FROM event_bookings b WHERE b.event_id = e.id AND b.status = 'confirmed')::int AS bookings,
              (SELECT COALESCE(sum(b.quantity), 0) FROM event_bookings b
                WHERE b.event_id = e.id AND b.status = 'confirmed')::int AS passes_sold,
              (SELECT COALESCE(sum(pay.amount_paise), 0) FROM payments pay JOIN orders o ON o.id = pay.order_id
                WHERE o.event_id = e.id AND pay.status IN ('captured', 'refunded'))::bigint AS gross,
              (SELECT COALESCE(sum(pay.amount_refunded_paise), 0) FROM payments pay JOIN orders o ON o.id = pay.order_id
                WHERE o.event_id = e.id)::bigint AS refunded
         FROM events e
         JOIN cities c ON c.id = e.city_id
        WHERE e.first_published_at IS NOT NULL
          AND e.status IN ('published', 'archived')
          AND e.event_date BETWEEN :fromDate AND :toDate
          AND ${CITY_OF_EVENT('e.city_id')}
          ${page.after ? `AND (e.event_date, e.id) > (CAST(:afterDate AS date), CAST(:afterId AS uuid))` : ''}
        ORDER BY e.event_date ASC, e.id ASC
        LIMIT :limit`,
      {
        ...params(p),
        afterDate: page.after?.date ?? null,
        afterId: page.after?.id ?? null,
        limit: page.limit,
      },
    );
  }

  function decodeEventCursor(value: string): { date: string; id: string } {
    try {
      const parsed: unknown = JSON.parse(Buffer.from(value, 'base64url').toString('utf8'));
      if (
        Array.isArray(parsed) &&
        typeof parsed[0] === 'string' &&
        /^\d{4}-\d{2}-\d{2}$/.test(parsed[0]) &&
        typeof parsed[1] === 'string' &&
        UUID_PATTERN.test(parsed[1])
      ) {
        return { date: parsed[0], id: parsed[1] };
      }
    } catch {
      // fall through
    }
    throw invalid('cursor', 'Invalid cursor.');
  }

  return {
    resolvePeriod,

    async summary(role, query) {
      const p = await resolvePeriod(query);
      const can = (permission: Parameters<typeof roleHasPermission>[1]) =>
        roleHasPermission(role, permission);
      const [u, e, m, r, b, rev] = await Promise.all([
        can('users:view') ? users(p) : null,
        can('events:view') ? events(p) : null,
        can('users:view') ? matches(p) : null,
        can('reports:manage') ? reports(p) : null,
        can('payments:view') ? bookings(p) : null,
        can('payments:view') ? revenue(p) : null,
      ]);
      return {
        period: periodDto(p),
        users: u,
        events: e,
        matches: m,
        reports: r,
        bookings: b,
        revenue: rev,
      };
    },

    async trends(role, query) {
      const p = await resolvePeriod(query);
      const days = daysBetween(p.from, p.to) + 1;
      const interval = days > LIMITS.DASHBOARD_DAILY_BUCKET_MAX_DAYS ? 'week' : 'day';
      const labels: string[] = [];
      for (
        let date = interval === 'week' ? mondayOf(p.from) : p.from;
        date <= p.to;
        date = addDays(date, interval === 'week' ? 7 : 1)
      ) {
        labels.push(date);
      }
      const series = async (
        permission: Parameters<typeof roleHasPermission>[1],
        sql: Parameters<typeof bucketed>[2],
      ) => {
        if (!roleHasPermission(role, permission)) return null;
        const values = await bucketed(p, interval, sql);
        return labels.map((label) => values.get(label) ?? 0);
      };
      const [signups, matchesSeries, reportsSeries, bookingsSeries, revenueSeries] =
        await Promise.all([
          series('users:view', {
            value: 'count(*)',
            from: 'users u',
            at: 'u.created_at',
            where: `u.deleted_at IS NULL AND ${CITY_OF_USER('u.id')}`,
          }),
          series('users:view', {
            value: 'count(*)',
            from: 'matches m',
            at: 'm.created_at',
            where: `(${CITY_OF_USER('m.user_a_id')} OR ${CITY_OF_USER('m.user_b_id')})`,
          }),
          series('reports:manage', {
            value: 'count(*)',
            from: 'reports r',
            at: 'r.created_at',
            where: CITY_OF_USER('r.reported_user_id'),
          }),
          series('payments:view', {
            value: 'count(*)',
            from: 'event_bookings b JOIN events e ON e.id = b.event_id',
            at: 'b.created_at',
            where: `b.status = 'confirmed' AND ${CITY_OF_EVENT('e.city_id')}`,
          }),
          series('payments:view', {
            value: 'sum(pay.amount_paise)',
            from: 'payments pay JOIN orders o ON o.id = pay.order_id JOIN events e ON e.id = o.event_id',
            at: 'pay.captured_at',
            where: `pay.status IN ('captured', 'refunded') AND ${CITY_OF_EVENT('e.city_id')}`,
          }),
        ]);
      return {
        period: periodDto(p),
        interval,
        labels,
        series: {
          signups,
          matches: matchesSeries,
          reports: reportsSeries,
          bookings: bookingsSeries,
          revenuePaise: revenueSeries,
        },
      };
    },

    async events(role, query) {
      const p = await resolvePeriod(query);
      const limit = query.limit ?? LIMITS.ADMIN_PAGE_SIZE_DEFAULT;
      const rows = await eventRows(p, {
        after: query.cursor ? decodeEventCursor(query.cursor) : null,
        limit: limit + 1,
      });
      const page = rows.slice(0, limit);
      const last = page.at(-1);
      const withSales = roleHasPermission(role, 'payments:view');
      return {
        items: page.map((row) => toEventRow(row, withSales)),
        meta: {
          nextCursor:
            rows.length > limit && last
              ? Buffer.from(JSON.stringify([last.event_date, last.id])).toString('base64url')
              : null,
        },
      };
    },

    async exportEvents(query) {
      const p = await resolvePeriod(query);
      const rows = await eventRows(p, { after: null, limit: LIMITS.DASHBOARD_EXPORT_MAX_ROWS });
      return rows.map((row) => toEventRow(row, true));
    },
  };
}
