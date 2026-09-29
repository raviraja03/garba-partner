import type { Express } from 'express';
import request from 'supertest';
import sharp from 'sharp';
import { beforeEach, describe, expect, it } from 'vitest';
import { AdminAuditLog, Event } from '../../../models/index.js';
import {
  ALKAPURI,
  VADODARA,
  bearer,
  createEvent,
  createOrganizer,
  eventInput,
  inDays,
  publishEvent,
} from '../../../test/event-fixtures.js';
import {
  createFakeMediaStorage,
  createTestApp,
  hasTestDatabase,
  loginAdmin,
  loginMember,
  makeImage,
  uniqueIp,
  useTestDatabase,
  type FakeMediaStorage,
} from '../../../test/helpers.js';

describe.skipIf(!hasTestDatabase)('admin event management (integration)', () => {
  const db = useTestDatabase();
  let app: Express;
  let media: FakeMediaStorage;
  let ip: string;

  beforeEach(() => {
    media = createFakeMediaStorage();
    app = createTestApp({ sequelize: db(), media });
    ip = uniqueIp();
  });

  async function manager() {
    const { accessToken } = await loginAdmin(app, ip, 'event_manager');
    const organizer = await createOrganizer(app, accessToken);
    return { token: accessToken, organizer };
  }

  describe('permissions', () => {
    it('requires an admin session: anonymous and member tokens get 401', async () => {
      expect((await request(app).get('/api/v1/admin/events')).status).toBe(401);
      const member = await loginMember(app, ip);
      for (const [method, path] of [
        ['get', '/api/v1/admin/events'],
        ['post', '/api/v1/admin/events'],
      ] as const) {
        const res = await request(app)[method](path).set(bearer(member.accessToken)).send({});
        expect(res.status).toBe(401);
      }
    });

    it('lets moderators view but never create, edit, publish, verify, archive or delete', async () => {
      const { token, organizer } = await manager();
      const event = await createEvent(app, token, organizer.id);
      const moderator = await loginAdmin(app, ip, 'moderator');
      const auth = bearer(moderator.accessToken);
      const base = `/api/v1/admin/events/${event.id}`;

      expect((await request(app).get('/api/v1/admin/events').set(auth)).status).toBe(200);
      expect((await request(app).get(base).set(auth)).status).toBe(200);

      const attempts = [
        request(app).post('/api/v1/admin/events').set(auth).send(eventInput(organizer.id)),
        request(app).patch(base).set(auth).send({ name: 'Hijacked' }),
        request(app).delete(base).set(auth),
        ...['publish', 'unpublish', 'verify', 'unverify', 'archive', 'restore'].map((action) =>
          request(app).post(`${base}/${action}`).set(auth),
        ),
      ];
      for (const res of await Promise.all(attempts)) expect(res.status).toBe(403);
      expect((await Event.findByPk(event.id))?.name).toBe(event.name);
    });

    it('allows super admins to manage events', async () => {
      const { organizer } = await manager();
      const superAdmin = await loginAdmin(app, ip, 'super_admin');
      const event = await createEvent(app, superAdmin.accessToken, organizer.id);
      expect(event.status).toBe('draft');
    });
  });

  describe('create', () => {
    it('creates a draft with IST times, a slug and generated start/end instants', async () => {
      const { token, organizer } = await manager();
      const date = inDays(3);
      const event = await createEvent(app, token, organizer.id, {
        name: 'Sheri Garba Mahotsav',
        eventDate: date,
        startTime: '20:00',
        endTime: '01:00',
      });

      expect(event).toMatchObject({
        status: 'draft',
        isVerified: false,
        eventDate: date,
        startTime: '20:00',
        endTime: '01:00',
        canDelete: true,
        publishedAt: null,
      });
      expect(event.slug).toMatch(/^sheri-garba-mahotsav-[a-z0-9]{6}$/);
      // 20:00 IST = 14:30 UTC; the 01:00 end time is after midnight (next day, 19:30 UTC).
      expect(event.startsAt).toBe(`${date}T14:30:00.000Z`);
      expect(event.endsAt).toBe(`${date}T19:30:00.000Z`);
      expect(event.createdBy?.name).toBe('Test event_manager');

      const audit = await AdminAuditLog.findOne({ where: { action: 'event.create' } });
      expect(audit?.targetId).toBe(event.id);
    });

    it('validates input and rejects mass assignment', async () => {
      const { token, organizer } = await manager();
      const cases: Record<string, unknown>[] = [
        { eventDate: inDays(-1) },
        { eventDate: inDays(800) },
        { eventDate: '2026-02-30' },
        { startTime: '20:00', endTime: '20:00' },
        { startTime: '8pm' },
        { ticketUrl: 'http://tickets.example.com' },
        { ticketUrl: 'javascript:alert(1)' },
        { ticketUrl: 'https://tickets.example.com/"><script>' },
        { description: 'Call the organizer on 98765 43210 to book.' },
        { name: 'ab' },
        { areaId: ALKAPURI }, // Vadodara area on an Ahmedabad event
        { cityId: 'c1000000-0000-4000-8000-000000000099', areaId: null },
        { status: 'published' },
        { isVerified: true },
        { slug: 'my-own-slug' },
      ];
      for (const overrides of cases) {
        const res = await request(app)
          .post('/api/v1/admin/events')
          .set(bearer(token))
          .send({ ...eventInput(organizer.id), ...overrides });
        expect(res.status, JSON.stringify(overrides)).toBe(400);
        expect(res.body.error.code).toBe('VALIDATION_ERROR');
      }
      expect(await Event.count()).toBe(0);
    });

    it('rejects unknown or archived organizers', async () => {
      const { token, organizer } = await manager();
      const unknown = await request(app)
        .post('/api/v1/admin/events')
        .set(bearer(token))
        .send(eventInput('0e4b0c1a-5555-4000-8000-000000000000'));
      expect(unknown.status).toBe(400);
      expect(unknown.body.error.details[0].path).toBe('organizerId');

      await request(app)
        .post(`/api/v1/admin/organizers/${organizer.id}/archive`)
        .set(bearer(token))
        .expect(200);
      const archived = await request(app)
        .post('/api/v1/admin/events')
        .set(bearer(token))
        .send(eventInput(organizer.id));
      expect(archived.status).toBe(400);
    });
  });

  describe('update', () => {
    it('keeps verification for non-material edits and clears it for material ones', async () => {
      const { token, organizer } = await manager();
      const event = await createEvent(app, token, organizer.id);
      const url = `/api/v1/admin/events/${event.id}`;
      await request(app).post(`${url}/verify`).set(bearer(token)).expect(200);

      const described = await request(app)
        .patch(url)
        .set(bearer(token))
        .send({ description: 'Updated description with more detail about the night.' });
      expect(described.status).toBe(200);
      expect(described.body.data.isVerified).toBe(true);

      const moved = await request(app)
        .patch(url)
        .set(bearer(token))
        .send({ ticketUrl: 'https://other-tickets.example.com/pass' });
      expect(moved.body.data).toMatchObject({ isVerified: false, verifiedAt: null });

      const audit = await AdminAuditLog.findOne({
        where: { action: 'event.update', targetId: event.id },
        order: [['createdAt', 'DESC']],
      });
      expect(audit?.metadata).toMatchObject({ fields: ['ticketUrl'], verificationReset: true });
    });

    it('re-validates schedule and location, and clears the area when the city changes', async () => {
      const { token, organizer } = await manager();
      const event = await createEvent(app, token, organizer.id);
      const url = `/api/v1/admin/events/${event.id}`;

      const past = await request(app)
        .patch(url)
        .set(bearer(token))
        .send({ eventDate: inDays(-2) });
      expect(past.status).toBe(400);
      const sameTimes = await request(app)
        .patch(url)
        .set(bearer(token))
        .send({ endTime: event.startTime });
      expect(sameTimes.status).toBe(400);

      const cityOnly = await request(app).patch(url).set(bearer(token)).send({ cityId: VADODARA });
      expect(cityOnly.status).toBe(200);
      expect(cityOnly.body.data).toMatchObject({ city: { id: VADODARA }, area: null });

      const withArea = await request(app).patch(url).set(bearer(token)).send({ areaId: ALKAPURI });
      expect(withArea.body.data.area.id).toBe(ALKAPURI);

      const newTime = await request(app)
        .patch(url)
        .set(bearer(token))
        .send({ startTime: '19:00', endTime: '22:00' });
      expect(newTime.body.data).toMatchObject({ startTime: '19:00', endTime: '22:00' });
      expect(newTime.body.data.startsAt).toBe(`${event.eventDate}T13:30:00.000Z`);
    });

    it('treats an unchanged submission as a no-op and requires at least one field', async () => {
      const { token, organizer } = await manager();
      const event = await createEvent(app, token, organizer.id);
      const url = `/api/v1/admin/events/${event.id}`;
      expect((await request(app).patch(url).set(bearer(token)).send({})).status).toBe(400);

      const same = await request(app)
        .patch(url)
        .set(bearer(token))
        .send({ name: event.name, startTime: event.startTime });
      expect(same.status).toBe(200);
      expect(await AdminAuditLog.count({ where: { action: 'event.update' } })).toBe(0);
    });

    it('returns 404 for unknown events and 400 for malformed ids', async () => {
      const { token } = await manager();
      const missing = await request(app)
        .get('/api/v1/admin/events/0e4b0c1a-5555-4000-8000-000000000000')
        .set(bearer(token));
      expect(missing.status).toBe(404);
      const malformed = await request(app).get('/api/v1/admin/events/nope').set(bearer(token));
      expect(malformed.status).toBe(400);
    });
  });

  describe('lifecycle', () => {
    it('publishes, unpublishes, archives and restores with audit entries', async () => {
      const { token, organizer } = await manager();
      const event = await createEvent(app, token, organizer.id);
      const url = `/api/v1/admin/events/${event.id}`;

      const published = await request(app).post(`${url}/publish`).set(bearer(token));
      expect(published.body.data).toMatchObject({ status: 'published', canDelete: false });
      expect(published.body.data.publishedAt).not.toBeNull();
      expect((await request(app).post(`${url}/publish`).set(bearer(token))).status).toBe(409);

      const unpublished = await request(app).post(`${url}/unpublish`).set(bearer(token));
      expect(unpublished.body.data).toMatchObject({ status: 'draft', publishedAt: null });
      expect(unpublished.body.data.firstPublishedAt).not.toBeNull();

      const archived = await request(app).post(`${url}/archive`).set(bearer(token));
      expect(archived.body.data.status).toBe('archived');
      expect(
        (await request(app).patch(url).set(bearer(token)).send({ name: 'Edited name' })).status,
      ).toBe(409);
      expect((await request(app).post(`${url}/publish`).set(bearer(token))).status).toBe(409);

      const restored = await request(app).post(`${url}/restore`).set(bearer(token));
      expect(restored.body.data.status).toBe('draft');

      const actions = (
        await AdminAuditLog.findAll({
          where: { targetId: event.id },
          order: [['createdAt', 'ASC']],
        })
      ).map((entry) => entry.action);
      expect(actions).toEqual([
        'event.create',
        'event.publish',
        'event.unpublish',
        'event.archive',
        'event.restore',
      ]);
    });

    it('refuses to publish ended events or events whose organizer is archived', async () => {
      const { token, organizer } = await manager();
      const event = await createEvent(app, token, organizer.id);
      await db().query(`UPDATE events SET event_date = event_date - 30 WHERE id = :id`, {
        replacements: { id: event.id },
      });
      const ended = await request(app)
        .post(`/api/v1/admin/events/${event.id}/publish`)
        .set(bearer(token));
      expect(ended.status).toBe(409);

      const other = await createEvent(app, token, organizer.id);
      await db().query(`UPDATE event_organizers SET status = 'archived', archived_at = now()`);
      const archivedOrganizer = await request(app)
        .post(`/api/v1/admin/events/${other.id}/publish`)
        .set(bearer(token));
      expect(archivedOrganizer.status).toBe(409);
    });

    it('hard-deletes only never-published events', async () => {
      const { token, organizer } = await manager();
      const draft = await createEvent(app, token, organizer.id);
      const deleted = await request(app)
        .delete(`/api/v1/admin/events/${draft.id}`)
        .set(bearer(token));
      expect(deleted.status).toBe(200);
      expect(await Event.findByPk(draft.id)).toBeNull();
      expect(await AdminAuditLog.count({ where: { action: 'event.delete' } })).toBe(1);

      const once = await createEvent(app, token, organizer.id);
      await publishEvent(app, token, once.id);
      await request(app).post(`/api/v1/admin/events/${once.id}/archive`).set(bearer(token));
      const refused = await request(app)
        .delete(`/api/v1/admin/events/${once.id}`)
        .set(bearer(token));
      expect(refused.status).toBe(409);
      expect(await Event.findByPk(once.id)).not.toBeNull();
    });
  });

  describe('image', () => {
    it('uploads a sanitised image, replaces the old one and removes it', async () => {
      const { token, organizer } = await manager();
      const event = await createEvent(app, token, organizer.id);
      const url = `/api/v1/admin/events/${event.id}/image`;

      const first = await request(app)
        .post(url)
        .set(bearer(token))
        .attach('image', await makeImage({ width: 1200, height: 675, gps: true }), {
          filename: 'poster.jpg',
          contentType: 'image/jpeg',
        });
      expect(first.status).toBe(200);
      expect(first.body.data.imageUrl).toBe(
        'https://media.test/event_banner/test/event-images/img1',
      );
      const stored = media.stored.get('test/event-images/img1');
      expect(stored).toBeDefined();
      expect((await sharp(stored).metadata()).exif).toBeUndefined();

      await request(app)
        .post(url)
        .set(bearer(token))
        .attach('image', await makeImage({ width: 800, height: 800 }), {
          filename: 'b.png',
          contentType: 'image/jpeg',
        })
        .expect(200);
      expect(media.destroyed).toEqual(['test/event-images/img1']);

      const removed = await request(app).delete(url).set(bearer(token));
      expect(removed.body.data.imageUrl).toBeNull();
      expect(media.destroyed).toEqual(['test/event-images/img1', 'test/event-images/img2']);
    });

    it('rejects non-images and moderators', async () => {
      const { token, organizer } = await manager();
      const event = await createEvent(app, token, organizer.id);
      const url = `/api/v1/admin/events/${event.id}/image`;

      const fake = await request(app)
        .post(url)
        .set(bearer(token))
        .attach('image', Buffer.from('not an image'), {
          filename: 'x.jpg',
          contentType: 'image/jpeg',
        });
      expect(fake.status).toBe(400);
      expect(fake.body.error.code).toBe('INVALID_IMAGE');

      const moderator = await loginAdmin(app, ip, 'moderator');
      const denied = await request(app)
        .post(url)
        .set(bearer(moderator.accessToken))
        .attach('image', await makeImage({ width: 800, height: 800 }), {
          filename: 'x.jpg',
          contentType: 'image/jpeg',
        });
      expect(denied.status).toBe(403);
      expect(media.stored.size).toBe(0);
    });
  });

  describe('list', () => {
    it('filters, searches, sorts and paginates', async () => {
      const { token, organizer } = await manager();
      const a = await createEvent(app, token, organizer.id, {
        name: 'Alpha Garba',
        eventDate: inDays(3),
      });
      const b = await createEvent(app, token, organizer.id, {
        name: 'Beta Dandiya',
        eventDate: inDays(1),
      });
      const c = await createEvent(app, token, organizer.id, {
        name: 'Gamma Raas',
        eventDate: inDays(2),
        cityId: VADODARA,
        areaId: null,
      });
      await publishEvent(app, token, b.id);
      const auth = bearer(token);
      const names = (res: request.Response) =>
        (res.body.data as { name: string }[]).map((event) => event.name);

      const byDate = await request(app).get('/api/v1/admin/events?sort=date_asc&limit=2').set(auth);
      expect(names(byDate)).toEqual(['Beta Dandiya', 'Gamma Raas']);
      const page2 = await request(app)
        .get(
          `/api/v1/admin/events?sort=date_asc&limit=2&cursor=${String(byDate.body.meta.nextCursor)}`,
        )
        .set(auth);
      expect(names(page2)).toEqual(['Alpha Garba']);
      expect(page2.body.meta.nextCursor).toBeNull();

      // A cursor cannot be replayed with a different sort.
      const mismatch = await request(app)
        .get(`/api/v1/admin/events?sort=name_asc&cursor=${String(byDate.body.meta.nextCursor)}`)
        .set(auth);
      expect(mismatch.status).toBe(400);

      const byName = await request(app).get('/api/v1/admin/events?sort=name_asc').set(auth);
      expect(names(byName)).toEqual(['Alpha Garba', 'Beta Dandiya', 'Gamma Raas']);

      expect(
        names(await request(app).get('/api/v1/admin/events?status=published').set(auth)),
      ).toEqual(['Beta Dandiya']);
      expect(
        names(await request(app).get(`/api/v1/admin/events?cityId=${VADODARA}`).set(auth)),
      ).toEqual(['Gamma Raas']);
      expect(names(await request(app).get('/api/v1/admin/events?q=alpha').set(auth))).toEqual([
        'Alpha Garba',
      ]);
      expect(names(await request(app).get(`/api/v1/admin/events?q=${c.slug}`).set(auth))).toEqual([
        'Gamma Raas',
      ]);
      expect(names(await request(app).get(`/api/v1/admin/events?q=${a.id}`).set(auth))).toEqual([
        'Alpha Garba',
      ]);
      expect(
        names(
          await request(app)
            .get(`/api/v1/admin/events?from=${inDays(2)}&to=${inDays(3)}&sort=date_asc`)
            .set(auth),
        ),
      ).toEqual(['Gamma Raas', 'Alpha Garba']);
      expect(
        (
          await request(app)
            .get(`/api/v1/admin/events?from=${inDays(3)}&to=${inDays(1)}`)
            .set(auth)
        ).status,
      ).toBe(400);
      expect((await request(app).get('/api/v1/admin/events?sort=random').set(auth)).status).toBe(
        400,
      );
    });
  });
});
