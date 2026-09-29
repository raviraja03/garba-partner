import { randomUUID } from 'node:crypto';
import type { Express } from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  addDays,
  todayInIndia,
  type AdminDashboardEventRowDto,
  type AdminDashboardSummaryDto,
  type AdminDashboardTrendsDto,
  type AdminRole,
  type CreatedOrderDto,
  type VerifyPaymentResultDto,
} from '@garba-partner/shared';
import { AdminAuditLog, User } from '../../../models/index.js';
import {
  ALKAPURI,
  AHMEDABAD,
  bearer,
  createEvent,
  createOrganizer,
  inDays,
  publishEvent,
  VADODARA,
} from '../../../test/event-fixtures.js';
import {
  createTestApp,
  hasTestDatabase,
  loginAdmin,
  uniqueIp,
  useTestDatabase,
} from '../../../test/helpers.js';
import { createMatchedPair, createMember, type TestMember } from '../../../test/member-fixtures.js';
import { createRazorpayMock, type RazorpayMock } from '../../../test/razorpay-mock.js';
import { csvCell } from './admin-dashboard.routes.js';

const PRICE = 50_000; // ₹500
const today = todayInIndia();

describe.skipIf(!hasTestDatabase)('admin dashboard (integration)', () => {
  const db = useTestDatabase();
  let app: Express;
  let razorpay: RazorpayMock;
  let ip: string;
  const tokens = new Map<AdminRole, string>();

  beforeEach(async () => {
    razorpay = createRazorpayMock();
    app = createTestApp({ sequelize: db(), payments: razorpay.gateway });
    ip = uniqueIp();
    tokens.clear();
    for (const role of ['super_admin', 'moderator', 'event_manager'] as const) {
      tokens.set(role, (await loginAdmin(app, ip, role)).accessToken);
    }
  });

  const token = (role: AdminRole) => tokens.get(role) ?? '';
  const get = (role: AdminRole, path: string) =>
    request(app)
      .get(`/api/v1/admin/dashboard${path}`)
      .set(bearer(token(role)));
  const summary = async (role: AdminRole, query = '') => {
    const res = await get(role, `/summary${query}`);
    expect(res.status).toBe(200);
    return res.body.data as AdminDashboardSummaryDto;
  };

  async function publishedEvent(
    overrides: Record<string, unknown> = {},
    pricePaise: number | null = PRICE,
  ) {
    const manager = token('event_manager');
    const organizer = await createOrganizer(app, manager);
    const event = await createEvent(app, manager, organizer.id, overrides);
    await publishEvent(app, manager, event.id);
    if (pricePaise !== null) {
      await request(app)
        .put(`/api/v1/admin/events/${event.id}/pass`)
        .set(bearer(manager))
        .send({ pricePaise, capacity: 100 })
        .expect(200);
    }
    return event;
  }

  async function buy(member: TestMember, eventId: string, quantity: number) {
    const order = await request(app)
      .post('/api/v1/orders')
      .set(bearer(member.accessToken))
      .set('Idempotency-Key', randomUUID())
      .send({ eventId, quantity })
      .expect(201);
    const created = order.body.data as CreatedOrderDto;
    const { checkout } = razorpay.pay(created.checkout.razorpayOrderId);
    const verified = await request(app)
      .post(`/api/v1/orders/${created.order.id}/verify`)
      .set(bearer(member.accessToken))
      .send(checkout)
      .expect(200);
    return (verified.body.data as VerifyPaymentResultDto).booking?.id ?? '';
  }

  /** Two matched members, a Vadodara member, a suspension, an urgent report, 3 passes sold, 1 refunded. */
  async function seed() {
    const { a, b } = await createMatchedPair(app);
    const vadodara = await createMember(app, { cityId: VADODARA, areaId: ALKAPURI });
    const suspended = await createMember(app);
    await User.update({ photoVerifiedAt: new Date() }, { where: { id: a.userId } });
    await request(app)
      .post(`/api/v1/admin/users/${suspended.userId}/suspend`)
      .set(bearer(token('moderator')))
      .send({ reason: 'Suspended for the dashboard test' })
      .expect(200);
    await request(app)
      .post('/api/v1/reports')
      .set(bearer(vadodara.accessToken))
      .send({ reportedUserId: b.userId, reason: 'threatening_behavior', alsoBlock: false })
      .expect(201);
    const event = await publishedEvent();
    await buy(a, event.id, 2);
    const refunded = await buy(vadodara, event.id, 1);
    await request(app)
      .post(`/api/v1/admin/payments/bookings/${refunded}/refund`)
      .set(bearer(token('super_admin')))
      .send({ reason: 'Refund for the dashboard test' })
      .expect(200);
    return { a, b, vadodara, suspended, event };
  }

  describe('access control', () => {
    it('requires an admin session', async () => {
      expect((await request(app).get('/api/v1/admin/dashboard/summary')).status).toBe(401);
      const member = await createMember(app);
      const res = await request(app)
        .get('/api/v1/admin/dashboard/summary')
        .set(bearer(member.accessToken));
      expect(res.status).toBe(401);
    });

    it('shows each role only the sections its permissions allow', async () => {
      const present = (s: AdminDashboardSummaryDto) =>
        (['users', 'events', 'matches', 'reports', 'bookings', 'revenue'] as const).filter(
          (key) => s[key] !== null,
        );
      expect(present(await summary('super_admin'))).toEqual([
        'users',
        'events',
        'matches',
        'reports',
        'bookings',
        'revenue',
      ]);
      expect(present(await summary('moderator'))).toEqual([
        'users',
        'events',
        'matches',
        'reports',
      ]);
      expect(present(await summary('event_manager'))).toEqual(['events', 'bookings', 'revenue']);

      const moderatorTrends = (await get('moderator', '/trends')).body
        .data as AdminDashboardTrendsDto;
      expect(moderatorTrends.series.revenuePaise).toBeNull();
      expect(moderatorTrends.series.bookings).toBeNull();
      expect(moderatorTrends.series.signups).not.toBeNull();
      const managerTrends = (await get('event_manager', '/trends')).body
        .data as AdminDashboardTrendsDto;
      expect(managerTrends.series.signups).toBeNull();
      expect(managerTrends.series.reports).toBeNull();
      expect(managerTrends.series.revenuePaise).not.toBeNull();
    });

    it('gates the export behind payments:view and sets no-store', async () => {
      expect((await get('moderator', '/events/export')).status).toBe(403);
      const res = await get('event_manager', '/summary');
      expect(res.headers['cache-control']).toBe('no-store');
    });
  });

  describe('metrics', () => {
    it('counts users, matches, reports, bookings and revenue', async () => {
      const { a, b, vadodara, suspended } = await seed();
      const s = await summary('super_admin', `?to=${addDays(today, 10)}`);
      expect(s.users).toEqual({
        total: 4,
        newInPeriod: 4,
        active7d: 3, // the suspended member is not counted as active
        active30d: 3,
        verified: 1,
        suspended: 1,
        banned: 0,
      });
      expect(s.matches).toEqual({ createdInPeriod: 1, active: 1 });
      expect(s.reports).toEqual({ pending: 1, pendingUrgent: 1, openedInPeriod: 1 });
      expect(s.events).toEqual({ published: 1, inPeriod: 1, upcoming: 1 });
      expect(s.bookings).toEqual({
        confirmedInPeriod: 1,
        passesSoldInPeriod: 2,
        cancelledInPeriod: 1,
      });
      expect(s.revenue).toEqual({
        grossPaise: 3 * PRICE,
        refundedPaise: PRICE,
        netPaise: 2 * PRICE,
        currency: 'INR',
      });

      // Aggregates only: nothing that identifies a member.
      const raw = JSON.stringify((await get('super_admin', '/summary')).body);
      for (const m of [a, b, vadodara, suspended]) {
        expect(raw).not.toContain(m.userId);
        expect(raw).not.toContain(m.phone);
      }
    });

    it('filters by city', async () => {
      await seed();
      const s = await summary('super_admin', `?cityId=${VADODARA}&to=${addDays(today, 10)}`);
      expect(s.users?.total).toBe(1);
      expect(s.matches?.createdInPeriod).toBe(0);
      expect(s.events?.published).toBe(0);
      expect(s.bookings?.confirmedInPeriod).toBe(0);
      expect(s.revenue?.grossPaise).toBe(0);
      // The Vadodara member reported someone in Ahmedabad: the report counts in Ahmedabad.
      expect(s.reports?.pending).toBe(0);
      const ahmedabad = await summary('super_admin', `?cityId=${AHMEDABAD}`);
      expect(ahmedabad.reports?.pending).toBe(1);
      expect(ahmedabad.revenue?.grossPaise).toBe(3 * PRICE);
    });

    it('applies the date range to period metrics but not to current snapshots', async () => {
      await seed();
      const s = await summary('super_admin', '?from=2026-01-01&to=2026-01-31');
      expect(s.users).toMatchObject({ total: 4, newInPeriod: 0, suspended: 1 });
      expect(s.matches).toEqual({ createdInPeriod: 0, active: 1 });
      expect(s.reports).toEqual({ pending: 1, pendingUrgent: 1, openedInPeriod: 0 });
      expect(s.revenue).toMatchObject({ grossPaise: 0, refundedPaise: 0, netPaise: 0 });
      expect(s.period).toMatchObject({ from: '2026-01-01', to: '2026-01-31', cityId: null });
    });

    it('validates filters', async () => {
      for (const query of [
        `?from=${today}&to=${addDays(today, -1)}`,
        `?from=2025-01-01&to=2026-06-01`,
        '?from=2026-13-01',
        `?cityId=${randomUUID()}`,
        '?cityId=nope',
        '?page=2',
      ]) {
        const res = await get('super_admin', `/summary${query}`);
        expect(res.status, query).toBe(400);
      }
    });
  });

  describe('trends', () => {
    it('buckets by day (default 30 days) and by week for long ranges', async () => {
      await seed();
      const daily = (await get('super_admin', '/trends')).body.data as AdminDashboardTrendsDto;
      expect(daily.interval).toBe('day');
      expect(daily.labels).toHaveLength(30);
      expect(daily.labels.at(-1)).toBe(today);
      expect(daily.series.signups?.at(-1)).toBe(4);
      expect(daily.series.matches?.at(-1)).toBe(1);
      expect(daily.series.reports?.at(-1)).toBe(1);
      expect(daily.series.bookings?.at(-1)).toBe(1);
      expect(daily.series.revenuePaise?.at(-1)).toBe(3 * PRICE);
      expect(daily.series.signups?.slice(0, -1).every((v) => v === 0)).toBe(true);

      const weekly = (await get('super_admin', `/trends?from=${addDays(today, -120)}`)).body
        .data as AdminDashboardTrendsDto;
      expect(weekly.interval).toBe('week');
      expect(weekly.labels.every((d) => new Date(`${d}T00:00:00Z`).getUTCDay() === 1)).toBe(true);
      expect(weekly.series.signups?.reduce((sum, v) => sum + v, 0)).toBe(4);
    });
  });

  describe('per-event table and export', () => {
    async function threeEvents() {
      await publishedEvent({ name: 'Garba Night One', eventDate: inDays(3) });
      await publishedEvent({ name: 'Garba Night Two', eventDate: inDays(4) }, null);
      await publishedEvent({
        name: 'Garba Night Vadodara',
        eventDate: inDays(6),
        cityId: VADODARA,
        areaId: ALKAPURI,
      });
      await createEvent(
        app,
        token('event_manager'),
        (await createOrganizer(app, token('event_manager'))).id,
        {
          name: 'Draft Night Never Shown',
          eventDate: inDays(5),
        },
      );
    }
    const range = `from=${today}&to=${addDays(today, 10)}`;

    it('paginates events in the period, hides drafts, and adds sales for payments:view', async () => {
      await threeEvents();
      const first = await get('event_manager', `/events?${range}&limit=2`);
      expect(first.status).toBe(200);
      const page1 = first.body.data as AdminDashboardEventRowDto[];
      expect(page1.map((e) => e.name)).toEqual(['Garba Night One', 'Garba Night Two']);
      expect(page1[0]?.sales).toMatchObject({ pricePaise: PRICE, capacity: 100, passesSold: 0 });
      const cursor = first.body.meta.nextCursor as string;
      const second = await get('event_manager', `/events?${range}&limit=2&cursor=${cursor}`);
      expect((second.body.data as AdminDashboardEventRowDto[]).map((e) => e.name)).toEqual([
        'Garba Night Vadodara',
      ]);
      expect(second.body.meta.nextCursor).toBeNull();

      const moderatorRows = (await get('moderator', `/events?${range}`)).body
        .data as AdminDashboardEventRowDto[];
      expect(moderatorRows).toHaveLength(3);
      expect(moderatorRows.every((row) => row.sales === null)).toBe(true);

      const vadodara = (await get('super_admin', `/events?${range}&cityId=${VADODARA}`)).body
        .data as AdminDashboardEventRowDto[];
      expect(vadodara.map((e) => e.name)).toEqual(['Garba Night Vadodara']);
      expect((await get('super_admin', `/events?${range}&cursor=bogus`)).status).toBe(400);
    });

    it('exports aggregate per-event sales as CSV and audits it', async () => {
      const { event } = await seed();
      const res = await get('event_manager', `/events/export?${range}`);
      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('text/csv');
      expect(res.headers['content-disposition']).toContain('attachment; filename="event-sales-');
      const lines = res.text.trim().split('\r\n');
      expect(lines[0]).toBe(
        'event_id,event_name,event_date,city,status,going,interested,looking_for_partner,matches,pass_price_inr,capacity,bookings,passes_sold,gross_inr,refunded_inr,net_inr',
      );
      expect(lines).toHaveLength(2);
      expect(lines[1]).toContain(event.id);
      expect(lines[1]).toContain(',500.00,100,1,2,1500.00,500.00,1000.00');
      expect(res.text).not.toMatch(/\+?91\d{10}|\b\d{10}\b/); // no phone numbers
      const audit = await AdminAuditLog.findOne({ where: { action: 'dashboard.export' } });
      expect(audit?.metadata).toMatchObject({ report: 'event_sales', rows: 1 });
    });

    it('neutralises spreadsheet formulas in CSV cells', () => {
      expect(csvCell('=HYPERLINK("x")')).toBe(`"'=HYPERLINK(""x"")"`);
      expect(csvCell('+91 call me')).toBe("'+91 call me");
      expect(csvCell('-2')).toBe("'-2");
      expect(csvCell('@SUM(A1)')).toBe("'@SUM(A1)");
      expect(csvCell('Garba, Night')).toBe('"Garba, Night"');
      expect(csvCell(-2)).toBe('-2');
      expect(csvCell(null)).toBe('');
    });
  });
});
