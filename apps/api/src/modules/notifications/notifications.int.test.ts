import { randomUUID } from 'node:crypto';
import type { Express } from 'express';
import { pino } from 'pino';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import type {
  AdminNotificationStatsDto,
  NotificationDto,
  NotificationPreferencesDto,
} from '@garba-partner/shared';
import { Event, Notification, User } from '../../models/index.js';
import { createRealtimeHub } from '../../realtime/hub.js';
import { bearer, createEvent, createOrganizer, publishEvent } from '../../test/event-fixtures.js';
import {
  createFakeMediaStorage,
  createTestApp,
  hasTestDatabase,
  loginAdmin,
  uniqueIp,
  useTestDatabase,
} from '../../test/helpers.js';
import { createMatchedPair, createMember, type TestMember } from '../../test/member-fixtures.js';
import { createEventReminders, purgeOldNotifications } from './notification-jobs.js';
import { createNotifier } from './notifications.service.js';

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

describe.skipIf(!hasTestDatabase)('notifications (integration)', () => {
  const db = useTestDatabase();
  let app: Express;
  let ip: string;

  beforeEach(() => {
    app = createTestApp({ sequelize: db() });
    ip = uniqueIp();
  });

  const list = async (m: TestMember, query = '') => {
    const res = await request(app).get(`/api/v1/notifications${query}`).set(bearer(m.accessToken));
    expect(res.status).toBe(200);
    return res.body as { data: NotificationDto[]; meta: { nextCursor: string | null } };
  };
  const unread = async (m: TestMember) =>
    (await request(app).get('/api/v1/notifications/unread-count').set(bearer(m.accessToken))).body
      .data.unread as number;
  const sendInterest = (from: TestMember, to: TestMember) =>
    request(app)
      .post('/api/v1/interests')
      .set(bearer(from.accessToken))
      .send({ receiverId: to.userId });
  const sendMessage = (m: TestMember, matchId: string, body: string) =>
    request(app)
      .post(`/api/v1/chats/${matchId}/messages`)
      .set(bearer(m.accessToken))
      .send({ clientMessageId: randomUUID(), body })
      .expect(201);
  const setPreferences = (m: TestMember, body: object) =>
    request(app).put('/api/v1/notifications/preferences').set(bearer(m.accessToken)).send(body);

  describe('triggers', () => {
    it('notifies the receiver of an interest, and the sender when it is accepted', async () => {
      const a = await createMember(app, { name: 'Asha', gender: 'woman' });
      const b = await createMember(app, { name: 'Bhavin' });
      const sent = await sendInterest(a, b).expect(201);
      // A repeated send notifies nobody again.
      await sendInterest(a, b).expect(200);

      const received = (await list(b)).data;
      expect(received).toHaveLength(1);
      expect(received[0]).toMatchObject({
        type: 'interest_received',
        interestId: sent.body.data.interestId,
        link: '/interests',
        readAt: null,
        actor: { id: a.userId, name: 'Asha' },
      });
      expect((await list(a)).data).toEqual([]);

      const accepted = await request(app)
        .post(`/api/v1/interests/${sent.body.data.interestId as string}/accept`)
        .set(bearer(b.accessToken))
        .expect(200);
      const matchId = accepted.body.data.id as string;
      const forSender = (await list(a)).data;
      expect(forSender).toEqual([
        expect.objectContaining({
          type: 'interest_accepted',
          matchId,
          link: `/matches/${matchId}`,
          actor: expect.objectContaining({ id: b.userId }),
        }),
      ]);
      // The accepting member did it themselves: nothing new for them.
      expect((await list(b)).data).toHaveLength(1);
    });

    it('notifies both members of a mutual match', async () => {
      const { a, b, matchId } = await createMatchedPair(app);
      // A got an interest first, then both got match_created.
      expect((await list(a)).data.map((n) => n.type)).toEqual(['match_created']);
      expect((await list(b)).data.map((n) => n.type)).toEqual([
        'match_created',
        'interest_received',
      ]);
      expect((await list(a)).data[0]?.matchId).toBe(matchId);
    });

    it('collapses new messages per chat, never includes the text, and reading the chat reads it', async () => {
      const { a, b, matchId } = await createMatchedPair(app);
      await request(app).post('/api/v1/notifications/read-all').set(bearer(b.accessToken));
      await sendMessage(a, matchId, 'Secret meeting spot is gate 3');
      const second = await sendMessage(a, matchId, 'See you at 8');

      const messages = (await list(b, '?unread=true')).data;
      expect(messages).toHaveLength(1);
      expect(messages[0]).toMatchObject({
        type: 'new_message',
        count: 2,
        matchId,
        link: `/chats/${matchId}`,
      });
      const raw = await request(app).get('/api/v1/notifications').set(bearer(b.accessToken));
      expect(JSON.stringify(raw.body)).not.toContain('gate 3');
      expect(await unread(b)).toBe(1);

      await request(app)
        .post(`/api/v1/chats/${matchId}/read`)
        .set(bearer(b.accessToken))
        .send({ lastReadMessageId: second.body.data.id as string })
        .expect(200);
      expect(await unread(b)).toBe(0);
      // A new message after reading starts a new notification.
      await sendMessage(a, matchId, 'Running late');
      expect((await list(b, '?unread=true')).data[0]?.count).toBe(1);
    });

    it('sends safety notices for sanctions and tells reporters their report was reviewed', async () => {
      const reporter = await createMember(app);
      const target = await createMember(app);
      const report = await request(app)
        .post('/api/v1/reports')
        .set(bearer(reporter.accessToken))
        .send({ reportedUserId: target.userId, reason: 'spam', alsoBlock: false })
        .expect(201);
      const moderator = await loginAdmin(app, ip, 'moderator');
      const note = 'Copy-pasted promotions to many members';
      await request(app)
        .post(`/api/v1/admin/reports/${report.body.data.reportId as string}/resolve`)
        .set(bearer(moderator.accessToken))
        .send({ action: 'warn', note })
        .expect(200);

      const forTarget = await request(app)
        .get('/api/v1/notifications')
        .set(bearer(target.accessToken));
      expect(forTarget.body.data).toEqual([
        expect.objectContaining({
          type: 'safety',
          safety: { kind: 'warning_issued' },
          actor: null,
        }),
      ]);
      expect(JSON.stringify(forTarget.body)).not.toContain(note);
      expect(JSON.stringify(forTarget.body)).not.toContain(reporter.userId);
      expect((await list(reporter)).data).toEqual([
        expect.objectContaining({ type: 'safety', safety: { kind: 'report_reviewed' } }),
      ]);

      await request(app)
        .post(`/api/v1/admin/users/${target.userId}/restrict-chat`)
        .set(bearer(moderator.accessToken))
        .send({ reason: 'Keep an eye on messages' })
        .expect(200);
      await request(app)
        .post(`/api/v1/admin/users/${target.userId}/lift-chat-restriction`)
        .set(bearer(moderator.accessToken))
        .send({ reason: 'Behaviour improved' })
        .expect(200);
      expect((await list(target)).data.map((n) => n.safety?.kind)).toEqual([
        'restriction_lifted',
        'chat_restricted',
        'warning_issued',
      ]);
    });

    it('supports verification_completed notifications (for the verification flow)', async () => {
      const member = await createMember(app);
      const notifier = createNotifier({
        sequelize: db(),
        media: createFakeMediaStorage(),
        hub: createRealtimeHub(),
        logger: pino({ level: 'silent' }),
      });
      await notifier.notify({
        userId: member.userId,
        type: 'verification_completed',
        data: { verificationType: 'photo', outcome: 'approved' },
      });
      expect((await list(member)).data[0]).toMatchObject({
        type: 'verification_completed',
        verification: { type: 'photo', outcome: 'approved' },
        link: '/profile',
      });
    });
  });

  describe('read state and pagination', () => {
    it('marks one or all as read, scoped to the owner', async () => {
      const target = await createMember(app);
      for (let i = 0; i < 3; i += 1) {
        await sendInterest(await createMember(app, { gender: 'woman' }), target).expect(201);
      }
      const other = await createMember(app);
      const [first] = (await list(target)).data;
      const id = first?.id ?? '';
      expect(await unread(target)).toBe(3);

      // IDOR: another member can't read (or learn about) this notification.
      expect(
        (await request(app).post(`/api/v1/notifications/${id}/read`).set(bearer(other.accessToken)))
          .status,
      ).toBe(404);
      const read = await request(app)
        .post(`/api/v1/notifications/${id}/read`)
        .set(bearer(target.accessToken));
      expect(read.status).toBe(200);
      expect(read.body.data.readAt).toEqual(expect.any(String));
      expect(await unread(target)).toBe(2);
      expect((await list(target, '?unread=true')).data).toHaveLength(2);

      const all = await request(app)
        .post('/api/v1/notifications/read-all')
        .set(bearer(target.accessToken));
      expect(all.body.data).toEqual({ updated: 2 });
      expect(await unread(target)).toBe(0);
      expect(await unread(other)).toBe(0);
    });

    it('paginates newest first with a cursor', async () => {
      const target = await createMember(app);
      for (let i = 0; i < 5; i += 1) {
        await sendInterest(await createMember(app, { gender: 'woman' }), target).expect(201);
      }
      const page1 = await list(target, '?limit=2');
      const page2 = await list(target, `?limit=2&cursor=${page1.meta.nextCursor ?? ''}`);
      const page3 = await list(target, `?limit=2&cursor=${page2.meta.nextCursor ?? ''}`);
      const ids = [...page1.data, ...page2.data, ...page3.data].map((n) => n.id);
      expect(new Set(ids).size).toBe(5);
      expect(page3.meta.nextCursor).toBeNull();
      const times = [...page1.data, ...page2.data, ...page3.data].map((n) => n.occurredAt);
      expect(times).toEqual([...times].sort().reverse());
      expect(
        (await request(app).get('/api/v1/notifications?limit=x').set(bearer(target.accessToken)))
          .status,
      ).toBe(400);
    });

    it('requires a member session and sets no-store', async () => {
      expect((await request(app).get('/api/v1/notifications')).status).toBe(401);
      const admin = await loginAdmin(app, ip, 'super_admin');
      expect(
        (await request(app).get('/api/v1/notifications').set(bearer(admin.accessToken))).status,
      ).toBe(401);
      const member = await createMember(app);
      const res = await request(app).get('/api/v1/notifications').set(bearer(member.accessToken));
      expect(res.headers['cache-control']).toBe('private, no-store');
    });
  });

  describe('preferences', () => {
    it('defaults to all on, can turn types off, and never turns off safety', async () => {
      const member = await createMember(app);
      const defaults = await request(app)
        .get('/api/v1/notifications/preferences')
        .set(bearer(member.accessToken));
      expect(Object.values(defaults.body.data as NotificationPreferencesDto).every(Boolean)).toBe(
        true,
      );
      const saved = await setPreferences(member, { new_message: false, interest_received: false });
      expect(saved.status).toBe(200);
      expect(saved.body.data).toMatchObject({
        new_message: false,
        interest_received: false,
        match_created: true,
      });
      expect((await setPreferences(member, { safety: false })).status).toBe(400);
      expect((await setPreferences(member, {})).status).toBe(400);
      expect((await setPreferences(member, { new_message: 'no' })).status).toBe(400);

      await sendInterest(await createMember(app, { gender: 'woman' }), member).expect(201);
      expect(await unread(member)).toBe(0);
      // Safety notices still arrive.
      const moderator = await loginAdmin(app, ip, 'moderator');
      await request(app)
        .post(`/api/v1/admin/users/${member.userId}/warn`)
        .set(bearer(moderator.accessToken))
        .send({ reason: 'Guideline reminder' })
        .expect(200);
      expect((await list(member)).data.map((n) => n.type)).toEqual(['safety']);
    });

    it('stops new-message notifications when turned off', async () => {
      const { a, b, matchId } = await createMatchedPair(app);
      await setPreferences(b, { new_message: false }).expect(200);
      await sendMessage(a, matchId, 'Hello!');
      expect((await list(b)).data.some((n) => n.type === 'new_message')).toBe(false);
    });
  });

  describe('privacy and safety rules', () => {
    it('removes notifications between two members when one blocks the other', async () => {
      const { a, b } = await createMatchedPair(app);
      expect((await list(b)).data.length).toBeGreaterThan(0);
      await request(app)
        .post('/api/v1/blocks')
        .set(bearer(a.accessToken))
        .send({ userId: b.userId })
        .expect(201);
      expect((await list(a)).data).toEqual([]);
      expect((await list(b)).data).toEqual([]);
    });

    it('hides the actor once their account is suspended, and never exposes private fields', async () => {
      const a = await createMember(app, { gender: 'woman', instagramId: 'private.handle' });
      const b = await createMember(app);
      await sendInterest(a, b).expect(201);
      const raw = await request(app).get('/api/v1/notifications').set(bearer(b.accessToken));
      const text = JSON.stringify(raw.body);
      expect(text).not.toContain(a.phone);
      expect(text).not.toContain('private.handle');
      expect(Object.keys((raw.body.data as NotificationDto[])[0]?.actor ?? {}).sort()).toEqual([
        'id',
        'name',
        'thumbnailUrl',
      ]);

      await User.update({ status: 'suspended' }, { where: { id: a.userId } });
      expect((await list(b)).data[0]?.actor).toBeNull();
    });

    it('stores nothing for banned recipients', async () => {
      const a = await createMember(app, { gender: 'woman' });
      const b = await createMember(app);
      await sendInterest(a, b).expect(201);
      await Notification.destroy({ where: {} });
      await User.update({ status: 'banned' }, { where: { id: b.userId } });
      const notifier = createNotifier({
        sequelize: db(),
        media: createFakeMediaStorage(),
        hub: createRealtimeHub(),
        logger: pino({ level: 'silent' }),
      });
      await notifier.notify({
        userId: b.userId,
        type: 'safety',
        data: { safetyKind: 'warning_issued' },
      });
      expect(await Notification.count()).toBe(0);
    });
  });

  describe('event reminders and retention', () => {
    it('reminds attendees once, before the event, respecting preferences', async () => {
      const admin = await loginAdmin(app, ip, 'event_manager');
      const organizer = await createOrganizer(app, admin.accessToken);
      const event = await createEvent(app, admin.accessToken, organizer.id);
      await publishEvent(app, admin.accessToken, event.id);
      const draft = await createEvent(app, admin.accessToken, organizer.id);

      const going = await createMember(app);
      const optedOut = await createMember(app);
      const onDraft = await createMember(app);
      for (const member of [going, optedOut]) {
        await request(app)
          .put(`/api/v1/events/${event.id}/attendance`)
          .set(bearer(member.accessToken))
          .send({ status: 'going', lookingForPartner: false })
          .expect(200);
      }
      await setPreferences(optedOut, { event_reminder: false }).expect(200);
      // Drafts can't be attended through the API; add the row directly to prove it is skipped.
      await db().query(
        `INSERT INTO event_attendances (event_id, user_id, status) VALUES (:eventId, :userId, 'going')`,
        { replacements: { eventId: draft.id, userId: onDraft.userId } },
      );

      const startsAt = (await Event.findByPk(event.id))?.startsAt ?? new Date();
      // Too early: more than 24 hours before the start.
      expect(await createEventReminders(db(), new Date(startsAt.getTime() - 2 * DAY_MS))).toEqual(
        [],
      );
      const now = new Date(startsAt.getTime() - 12 * HOUR_MS);
      expect(await createEventReminders(db(), now)).toHaveLength(1);
      expect(await createEventReminders(db(), now)).toEqual([]); // idempotent

      expect((await list(going)).data).toEqual([
        expect.objectContaining({
          type: 'event_reminder',
          event: expect.objectContaining({ id: event.id, slug: event.slug }),
          link: `/events/${event.slug}`,
        }),
      ]);
      expect(await unread(optedOut)).toBe(0);
      expect(await unread(onDraft)).toBe(0);
    });

    it('deletes notifications past the retention period', async () => {
      const member = await createMember(app);
      await sendInterest(await createMember(app, { gender: 'woman' }), member).expect(201);
      expect(await purgeOldNotifications(db(), new Date(Date.now() + 30 * DAY_MS))).toBe(0);
      expect(await purgeOldNotifications(db(), new Date(Date.now() + 91 * DAY_MS))).toBe(1);
      expect(await Notification.count()).toBe(0);
    });
  });

  describe('admin monitoring', () => {
    it('shows aggregate stats to admins only', async () => {
      const { a, b, matchId } = await createMatchedPair(app);
      await sendMessage(a, matchId, 'Hi');
      await setPreferences(b, { event_reminder: false }).expect(200);

      expect((await request(app).get('/api/v1/admin/notifications/stats')).status).toBe(401);
      expect(
        (await request(app).get('/api/v1/admin/notifications/stats').set(bearer(a.accessToken)))
          .status,
      ).toBe(401);
      const admin = await loginAdmin(app, ip, 'event_manager');
      const res = await request(app)
        .get('/api/v1/admin/notifications/stats')
        .set(bearer(admin.accessToken));
      expect(res.status).toBe(200);
      const stats = res.body.data as AdminNotificationStatsDto;
      const byType = Object.fromEntries(stats.byType.map((row) => [row.type, row]));
      expect(byType.match_created).toMatchObject({ last24h: 2, unread: 2, readRate7d: 0 });
      expect(byType.new_message).toMatchObject({ last24h: 1 });
      expect(byType.event_reminder).toMatchObject({ last7d: 0, readRate7d: null, optedOut: 1 });
      expect(byType.safety?.optedOut).toBeNull();
      expect(stats.totals).toMatchObject({ last24h: 4, stored: 4 });
      // Aggregates only: no member IDs anywhere.
      expect(JSON.stringify(res.body)).not.toContain(a.userId);
    });
  });
});
