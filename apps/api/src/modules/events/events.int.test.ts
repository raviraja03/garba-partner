import type { Express } from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  AHMEDABAD,
  VADODARA,
  bearer,
  createEvent,
  createOrganizer,
  inDays,
  publishEvent,
} from '../../test/event-fixtures.js';
import {
  createTestApp,
  hasTestDatabase,
  loginAdmin,
  uniqueIp,
  useTestDatabase,
} from '../../test/helpers.js';

const CARD_KEYS = [
  'area',
  'city',
  'endTime',
  'endsAt',
  'eventDate',
  'hasEnded',
  'hasTicketUrl',
  'id',
  'imageUrl',
  'isVerified',
  'name',
  'organizer',
  'slug',
  'startTime',
  'startsAt',
  'venueName',
];

const PRIVATE_VALUES = [
  'private.contact@organizer.test',
  '98765 11111',
  'Private Contact Person',
  'Internal: agreed',
];

describe.skipIf(!hasTestDatabase)('public events (integration)', () => {
  const db = useTestDatabase();
  let app: Express;
  let ip: string;
  let token: string;
  let organizerId: string;

  beforeEach(async () => {
    app = createTestApp({ sequelize: db() });
    ip = uniqueIp();
    token = (await loginAdmin(app, ip, 'event_manager')).accessToken;
    organizerId = (await createOrganizer(app, token)).id;
  });

  const list = (query = '') =>
    request(app).get(`/api/v1/events${query}`).set('X-Forwarded-For', ip);
  const names = (res: request.Response) =>
    (res.body.data as { name: string }[]).map((event) => event.name);

  async function published(overrides: Parameters<typeof createEvent>[3] = {}) {
    const event = await createEvent(app, token, organizerId, overrides);
    await publishEvent(app, token, event.id);
    return event;
  }

  describe('visibility', () => {
    it('lists only published, not-yet-ended events without authentication', async () => {
      const live = await published({ name: 'Published Night' });
      await createEvent(app, token, organizerId, { name: 'Draft Night' });
      const archived = await published({ name: 'Archived Night' });
      await request(app)
        .post(`/api/v1/admin/events/${archived.id}/archive`)
        .set(bearer(token))
        .expect(200);
      const ended = await published({ name: 'Ended Night' });
      await db().query(`UPDATE events SET event_date = event_date - 30 WHERE id = :id`, {
        replacements: { id: ended.id },
      });

      const res = await list();
      expect(res.status).toBe(200);
      expect(names(res)).toEqual(['Published Night']);
      expect(res.body.data[0].id).toBe(live.id);
      expect(res.headers['cache-control']).toBe('public, max-age=60');
    });

    it('serves event details by id or slug, but hides drafts and archived events', async () => {
      const event = await published();
      const draft = await createEvent(app, token, organizerId);

      const byId = await request(app).get(`/api/v1/events/${event.id}`);
      const bySlug = await request(app).get(`/api/v1/events/${event.slug}`);
      expect(byId.status).toBe(200);
      expect(bySlug.body.data.id).toBe(event.id);
      expect(byId.body.data).toMatchObject({
        description: event.description,
        venueAddress: 'Sabarmati Riverfront, Ahmedabad',
        ticketUrl: 'https://tickets.example.com/navratri',
        hasEnded: false,
      });

      expect((await request(app).get(`/api/v1/events/${draft.id}`)).status).toBe(404);
      expect((await request(app).get(`/api/v1/events/${draft.slug}`)).status).toBe(404);
      await request(app).post(`/api/v1/admin/events/${event.id}/archive`).set(bearer(token));
      expect((await request(app).get(`/api/v1/events/${event.id}`)).status).toBe(404);
      expect((await request(app).get('/api/v1/events/NOT a slug!')).status).toBe(400);
    });

    it('keeps ended events reachable by link, flagged as ended', async () => {
      const event = await published();
      await db().query(`UPDATE events SET event_date = event_date - 30 WHERE id = :id`, {
        replacements: { id: event.id },
      });
      const res = await request(app).get(`/api/v1/events/${event.slug}`);
      expect(res.status).toBe(200);
      expect(res.body.data.hasEnded).toBe(true);
    });

    it('hides events in deactivated cities', async () => {
      await published({ cityId: VADODARA, areaId: null });
      await db().query(`UPDATE cities SET is_active = false WHERE id = :id`, {
        replacements: { id: VADODARA },
      });
      try {
        expect(names(await list())).toEqual([]);
      } finally {
        await db().query(`UPDATE cities SET is_active = true WHERE id = :id`, {
          replacements: { id: VADODARA },
        });
      }
    });
  });

  describe('privacy', () => {
    it('returns only public fields and never private organizer information', async () => {
      const event = await published();
      await request(app).post(`/api/v1/admin/organizers/${organizerId}/verify`).set(bearer(token));

      const cards = await list();
      expect(Object.keys(cards.body.data[0]).sort()).toEqual(CARD_KEYS);
      expect(Object.keys(cards.body.data[0].organizer).sort()).toEqual([
        'id',
        'isVerified',
        'name',
      ]);
      expect(cards.body.data[0].organizer.isVerified).toBe(true);

      const detail = await request(app).get(`/api/v1/events/${event.id}`);
      expect(Object.keys(detail.body.data.organizer).sort()).toEqual([
        'description',
        'id',
        'instagramHandle',
        'isVerified',
        'name',
        'websiteUrl',
      ]);
      for (const res of [cards, detail]) {
        const serialized = JSON.stringify(res.body);
        for (const value of PRIVATE_VALUES) expect(serialized).not.toContain(value);
        expect(serialized).not.toMatch(/contact|notes|createdBy|updatedBy|AdminId|status/i);
      }
    });
  });

  describe('filters, sorting and pagination', () => {
    beforeEach(async () => {
      await published({ name: 'Day One', eventDate: inDays(1) });
      await published({
        name: 'Day Two Vadodara',
        eventDate: inDays(2),
        cityId: VADODARA,
        areaId: null,
      });
      await published({ name: 'Day Three', eventDate: inDays(3) });
      await published({ name: 'Day Four', eventDate: inDays(4) });
    });

    it('filters by city and by IST date range', async () => {
      expect(names(await list(`?cityId=${VADODARA}`))).toEqual(['Day Two Vadodara']);
      expect(names(await list(`?cityId=${AHMEDABAD}`))).toEqual([
        'Day One',
        'Day Three',
        'Day Four',
      ]);
      expect(names(await list(`?from=${inDays(2)}&to=${inDays(3)}`))).toEqual([
        'Day Two Vadodara',
        'Day Three',
      ]);
      expect(names(await list(`?from=${inDays(4)}`))).toEqual(['Day Four']);
      expect(names(await list(`?to=${inDays(1)}`))).toEqual(['Day One']);
    });

    it('sorts by date in either direction', async () => {
      expect(names(await list('?sort=date_desc'))).toEqual([
        'Day Four',
        'Day Three',
        'Day Two Vadodara',
        'Day One',
      ]);
    });

    it('paginates with an opaque cursor without duplicates or gaps', async () => {
      const first = await list('?limit=3&sort=date_desc');
      expect(names(first)).toEqual(['Day Four', 'Day Three', 'Day Two Vadodara']);
      const second = await list(
        `?limit=3&sort=date_desc&cursor=${String(first.body.meta.nextCursor)}`,
      );
      expect(names(second)).toEqual(['Day One']);
      expect(second.body.meta.nextCursor).toBeNull();
    });

    it('rejects invalid queries', async () => {
      for (const query of [
        '?cityId=not-a-uuid',
        '?from=2026-13-01',
        `?from=${inDays(3)}&to=${inDays(1)}`,
        '?sort=popular',
        '?cursor=garbage',
        '?limit=abc',
        '?status=draft',
      ]) {
        const res = await list(query);
        expect(res.status, query).toBe(400);
      }
    });
  });
});
