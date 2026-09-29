import type { Express } from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { AdminAuditLog } from '../../../models/index.js';
import {
  bearer,
  createEvent,
  createOrganizer,
  organizerInput,
  publishEvent,
} from '../../../test/event-fixtures.js';
import {
  createTestApp,
  hasTestDatabase,
  loginAdmin,
  loginMember,
  uniqueIp,
  useTestDatabase,
} from '../../../test/helpers.js';

describe.skipIf(!hasTestDatabase)('admin organizer management (integration)', () => {
  const db = useTestDatabase();
  let app: Express;
  let ip: string;

  beforeEach(() => {
    app = createTestApp({ sequelize: db() });
    ip = uniqueIp();
  });

  describe('permissions', () => {
    it('rejects anonymous callers and member tokens', async () => {
      expect((await request(app).get('/api/v1/admin/organizers')).status).toBe(401);
      const member = await loginMember(app, ip);
      const res = await request(app)
        .get('/api/v1/admin/organizers')
        .set(bearer(member.accessToken));
      expect(res.status).toBe(401);
    });

    it('lets moderators view organizers but not manage them', async () => {
      const manager = await loginAdmin(app, ip, 'event_manager');
      const organizer = await createOrganizer(app, manager.accessToken);
      const moderator = await loginAdmin(app, ip, 'moderator');

      const list = await request(app)
        .get('/api/v1/admin/organizers')
        .set(bearer(moderator.accessToken));
      expect(list.status).toBe(200);

      const create = await request(app)
        .post('/api/v1/admin/organizers')
        .set(bearer(moderator.accessToken))
        .send(organizerInput());
      expect(create.status).toBe(403);

      for (const action of ['verify', 'archive']) {
        const res = await request(app)
          .post(`/api/v1/admin/organizers/${organizer.id}/${action}`)
          .set(bearer(moderator.accessToken));
        expect(res.status).toBe(403);
      }
      const patch = await request(app)
        .patch(`/api/v1/admin/organizers/${organizer.id}`)
        .set(bearer(moderator.accessToken))
        .send({ name: 'Renamed' });
      expect(patch.status).toBe(403);
    });

    it('hides private contact details from admins without events:manage', async () => {
      const manager = await loginAdmin(app, ip, 'event_manager');
      const organizer = await createOrganizer(app, manager.accessToken);
      const moderator = await loginAdmin(app, ip, 'moderator');

      const asModerator = await request(app)
        .get(`/api/v1/admin/organizers/${organizer.id}`)
        .set(bearer(moderator.accessToken));
      expect(asModerator.status).toBe(200);
      expect(asModerator.body.data.contact).toBeNull();
      const serialized = JSON.stringify(asModerator.body);
      expect(serialized).not.toContain('private.contact@organizer.test');
      expect(serialized).not.toContain('98765 11111');
      expect(serialized).not.toContain('Internal:');

      const asManager = await request(app)
        .get(`/api/v1/admin/organizers/${organizer.id}`)
        .set(bearer(manager.accessToken));
      expect(asManager.body.data.contact).toMatchObject({
        contactEmail: 'private.contact@organizer.test',
        contactPhone: '+91 98765 11111',
      });
      expect(asManager.headers['cache-control']).toBe('no-store');
    });
  });

  describe('create and update', () => {
    it('creates an unverified, active organizer and audits it without contact values', async () => {
      const manager = await loginAdmin(app, ip, 'event_manager');
      const organizer = await createOrganizer(app, manager.accessToken, { name: 'Rangtaali Club' });

      expect(organizer).toMatchObject({
        name: 'Rangtaali Club',
        status: 'active',
        isVerified: false,
        eventCounts: { total: 0, upcomingPublished: 0 },
      });
      const audit = await AdminAuditLog.findOne({ where: { action: 'organizer.create' } });
      expect(audit?.targetType).toBe('organizer');
      expect(audit?.targetId).toBe(organizer.id);
      expect(JSON.stringify(audit?.metadata)).not.toContain('private.contact');
    });

    it('rejects mass assignment of verification and status', async () => {
      const { accessToken } = await loginAdmin(app, ip, 'event_manager');
      const res = await request(app)
        .post('/api/v1/admin/organizers')
        .set(bearer(accessToken))
        .send({ ...organizerInput(), isVerified: true, status: 'active' });
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('validates links, emails and public text', async () => {
      const { accessToken } = await loginAdmin(app, ip, 'event_manager');
      const cases = [
        { websiteUrl: 'http://insecure.example.com' },
        { websiteUrl: 'javascript:alert(1)' },
        { websiteUrl: 'https://user:pass@example.com' },
        { contactEmail: 'not-an-email' },
        { contactPhone: 'call me' },
        { description: 'Call our owner on 98765 43210 for passes' },
        { description: 'Write to owner@example.com' },
        { name: 'x' },
      ];
      for (const overrides of cases) {
        const res = await request(app)
          .post('/api/v1/admin/organizers')
          .set(bearer(accessToken))
          .send(organizerInput(overrides));
        expect(res.status, JSON.stringify(overrides)).toBe(400);
      }
    });

    it('rejects duplicate names case-insensitively', async () => {
      const { accessToken } = await loginAdmin(app, ip, 'event_manager');
      await createOrganizer(app, accessToken, { name: 'Sheri Garba' });
      const res = await request(app)
        .post('/api/v1/admin/organizers')
        .set(bearer(accessToken))
        .send(organizerInput({ name: 'SHERI garba' }));
      expect(res.status).toBe(409);
      expect(res.body.error.details[0].path).toBe('name');
    });

    it('clears verification when the public identity changes, but not for contact edits', async () => {
      const { accessToken } = await loginAdmin(app, ip, 'event_manager');
      const organizer = await createOrganizer(app, accessToken);
      await request(app)
        .post(`/api/v1/admin/organizers/${organizer.id}/verify`)
        .set(bearer(accessToken))
        .expect(200);

      const contactEdit = await request(app)
        .patch(`/api/v1/admin/organizers/${organizer.id}`)
        .set(bearer(accessToken))
        .send({ contactName: 'New Contact' });
      expect(contactEdit.body.data.isVerified).toBe(true);

      const rename = await request(app)
        .patch(`/api/v1/admin/organizers/${organizer.id}`)
        .set(bearer(accessToken))
        .send({ name: 'Brand New Name' });
      expect(rename.status).toBe(200);
      expect(rename.body.data).toMatchObject({ isVerified: false, verifiedAt: null });
    });
  });

  describe('verification and archiving', () => {
    it('verifies and unverifies, rejecting repeated transitions', async () => {
      const { accessToken } = await loginAdmin(app, ip, 'super_admin');
      const organizer = await createOrganizer(app, accessToken);
      const url = `/api/v1/admin/organizers/${organizer.id}`;

      const verified = await request(app).post(`${url}/verify`).set(bearer(accessToken));
      expect(verified.body.data.isVerified).toBe(true);
      expect(verified.body.data.verifiedAt).not.toBeNull();
      expect((await request(app).post(`${url}/verify`).set(bearer(accessToken))).status).toBe(409);

      const unverified = await request(app).post(`${url}/unverify`).set(bearer(accessToken));
      expect(unverified.body.data.isVerified).toBe(false);
      expect(await AdminAuditLog.count({ where: { targetId: organizer.id } })).toBe(3); // create, verify, unverify
    });

    it('blocks archiving while the organizer has upcoming published events', async () => {
      const { accessToken } = await loginAdmin(app, ip, 'event_manager');
      const organizer = await createOrganizer(app, accessToken);
      const event = await createEvent(app, accessToken, organizer.id);
      await publishEvent(app, accessToken, event.id);

      const blocked = await request(app)
        .post(`/api/v1/admin/organizers/${organizer.id}/archive`)
        .set(bearer(accessToken));
      expect(blocked.status).toBe(409);

      await request(app)
        .post(`/api/v1/admin/events/${event.id}/unpublish`)
        .set(bearer(accessToken))
        .expect(200);
      const archived = await request(app)
        .post(`/api/v1/admin/organizers/${organizer.id}/archive`)
        .set(bearer(accessToken));
      expect(archived.status).toBe(200);
      expect(archived.body.data).toMatchObject({ status: 'archived' });

      // Archived organizers cannot be edited or used for new events.
      const edit = await request(app)
        .patch(`/api/v1/admin/organizers/${organizer.id}`)
        .set(bearer(accessToken))
        .send({ description: 'Updated' });
      expect(edit.status).toBe(409);
      await expect(createEvent(app, accessToken, organizer.id)).rejects.toThrow(/400/);

      const restored = await request(app)
        .post(`/api/v1/admin/organizers/${organizer.id}/restore`)
        .set(bearer(accessToken));
      expect(restored.body.data.status).toBe('active');
    });

    it('lists with filters, search and cursor pagination, and offers only active organizers', async () => {
      const { accessToken } = await loginAdmin(app, ip, 'event_manager');
      const names = ['Aarti Garba', 'Bhavya Dandiya', 'Chaniya Choli Club', 'Dholi Nights'];
      const created = [];
      for (const name of names) created.push(await createOrganizer(app, accessToken, { name }));
      await request(app)
        .post(`/api/v1/admin/organizers/${created[3]?.id ?? ''}/archive`)
        .set(bearer(accessToken))
        .expect(200);

      const first = await request(app)
        .get('/api/v1/admin/organizers?limit=2')
        .set(bearer(accessToken));
      expect(first.body.data.map((o: { name: string }) => o.name)).toEqual(names.slice(0, 2));
      const second = await request(app)
        .get(`/api/v1/admin/organizers?limit=2&cursor=${String(first.body.meta.nextCursor)}`)
        .set(bearer(accessToken));
      expect(second.body.data.map((o: { name: string }) => o.name)).toEqual(names.slice(2, 4));
      expect(second.body.meta.nextCursor).toBeNull();

      const search = await request(app)
        .get('/api/v1/admin/organizers?q=dandiya')
        .set(bearer(accessToken));
      expect(search.body.data).toHaveLength(1);

      const archivedOnly = await request(app)
        .get('/api/v1/admin/organizers?status=archived')
        .set(bearer(accessToken));
      expect(archivedOnly.body.data.map((o: { name: string }) => o.name)).toEqual(['Dholi Nights']);

      const options = await request(app)
        .get('/api/v1/admin/organizers/options')
        .set(bearer(accessToken));
      expect(options.body.data.map((o: { name: string }) => o.name)).toEqual(names.slice(0, 3));
      expect(Object.keys(options.body.data[0]).sort()).toEqual(['id', 'isVerified', 'name']);

      const badCursor = await request(app)
        .get('/api/v1/admin/organizers?cursor=not-a-cursor')
        .set(bearer(accessToken));
      expect(badCursor.status).toBe(400);
    });
  });
});
