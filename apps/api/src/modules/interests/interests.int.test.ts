import type { Express } from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import type { InterestDto, MatchDto, PartnerDto } from '@garba-partner/shared';
import { Match, PartnerInterest, User } from '../../models/index.js';
import { bearer, createEvent, createOrganizer, publishEvent } from '../../test/event-fixtures.js';
import {
  createTestApp,
  hasTestDatabase,
  loginAdmin,
  uniqueIp,
  useTestDatabase,
} from '../../test/helpers.js';
import { createMember, type TestMember } from '../../test/member-fixtures.js';

describe.skipIf(!hasTestDatabase)('interests and matches (integration)', () => {
  const db = useTestDatabase();
  let app: Express;

  beforeEach(() => {
    app = createTestApp({ sequelize: db() });
  });

  const send = (from: TestMember, to: TestMember, extra: Record<string, unknown> = {}) =>
    request(app)
      .post('/api/v1/interests')
      .set(bearer(from.accessToken))
      .send({ receiverId: to.userId, ...extra });
  const received = async (m: TestMember) =>
    (await request(app).get('/api/v1/interests/received').set(bearer(m.accessToken))).body
      .data as InterestDto[];
  const sent = async (m: TestMember) =>
    (await request(app).get('/api/v1/interests/sent').set(bearer(m.accessToken))).body
      .data as InterestDto[];
  const matchesOf = async (m: TestMember) =>
    (await request(app).get('/api/v1/matches').set(bearer(m.accessToken))).body.data as MatchDto[];
  const action = (m: TestMember, interestId: string, verb: 'accept' | 'reject') =>
    request(app).post(`/api/v1/interests/${interestId}/${verb}`).set(bearer(m.accessToken));

  describe('sending', () => {
    it('sends a pending interest that shows in Sent and Received', async () => {
      const asha = await createMember(app, { name: 'Asha', gender: 'woman' });
      const bhavin = await createMember(app, { name: 'Bhavin' });

      const res = await send(asha, bhavin);
      expect(res.status).toBe(201);
      expect(res.body.data).toMatchObject({ matched: false, match: null, alreadySent: false });

      const [inbox] = await received(bhavin);
      expect(inbox).toMatchObject({ id: res.body.data.interestId, status: 'pending' });
      expect(inbox?.member.id).toBe(asha.userId);
      expect(JSON.stringify(inbox)).not.toContain(asha.phone);
      const [outbox] = await sent(asha);
      expect(outbox?.member.id).toBe(bhavin.userId);
    });

    it('is idempotent: sending twice keeps one pending interest', async () => {
      const a = await createMember(app);
      const b = await createMember(app);
      const first = await send(a, b);
      const second = await send(a, b);
      expect(second.status).toBe(200);
      expect(second.body.data).toMatchObject({
        alreadySent: true,
        interestId: first.body.data.interestId,
      });
      expect(await PartnerInterest.count()).toBe(1);
    });

    it('turns mutual interest into exactly one match', async () => {
      const a = await createMember(app);
      const b = await createMember(app);
      await send(a, b).expect(201);
      const back = await send(b, a);
      expect(back.status).toBe(201);
      expect(back.body.data.matched).toBe(true);
      expect(back.body.data.match.partner.id).toBe(a.userId);
      expect(await Match.count()).toBe(1);
      expect(await PartnerInterest.count({ where: { status: 'accepted' } })).toBe(1);

      // Further sends in either direction are refused while matched.
      expect((await send(a, b)).body.error.code).toBe('ALREADY_MATCHED');
      expect((await send(b, a)).status).toBe(409);
      expect(await Match.count()).toBe(1);
    });

    it('creates exactly one match when both members send at the same moment', async () => {
      const a = await createMember(app);
      const b = await createMember(app);
      const results = await Promise.all([send(a, b), send(b, a)]);
      expect(results.map((r) => r.status).sort()).toEqual([201, 201]);
      expect(results.filter((r) => r.body.data.matched)).toHaveLength(1);
      expect(await Match.count({ where: { status: 'active' } })).toBe(1);
      expect(await PartnerInterest.count({ where: { status: 'pending' } })).toBe(0);
    });

    it('validates input and applies the sending rules', async () => {
      const a = await createMember(app);
      const b = await createMember(app);
      expect((await send(a, a)).status).toBe(400);
      expect(
        (
          await request(app)
            .post('/api/v1/interests')
            .set(bearer(a.accessToken))
            .send({ receiverId: b.userId, senderId: b.userId })
        ).status,
      ).toBe(400);
      expect(
        (await request(app).post('/api/v1/interests').send({ receiverId: b.userId })).status,
      ).toBe(401);

      const unknown = await request(app)
        .post('/api/v1/interests')
        .set(bearer(a.accessToken))
        .send({ receiverId: '0e4b0c1a-5555-4000-8000-000000000000' });
      expect(unknown.body.error.code).toBe('USER_UNAVAILABLE');

      // Discovery off: can browse, can't send.
      const hidden = await createMember(app, { discoveryEnabled: false });
      expect((await send(hidden, b)).body.error.code).toBe('DISCOVERY_DISABLED');
      // …and can't be sent to.
      expect((await send(a, hidden)).body.error.code).toBe('USER_UNAVAILABLE');

      // Mutual preferences: b (a man) is not in a women-only member's range.
      const womenOnly = await createMember(app, { preferredGender: 'women' });
      expect((await send(a, womenOnly)).body.error.code).toBe('USER_UNAVAILABLE');
    });

    it('enforces the daily limit in the database', async () => {
      const a = await createMember(app);
      const b = await createMember(app);
      // 25 interests sent in the last 24 hours (expired, so they don't block anything else).
      const past = new Date(Date.now() - 60 * 60 * 1000);
      await PartnerInterest.bulkCreate(
        Array.from({ length: 25 }, () => ({
          senderId: a.userId,
          receiverId: b.userId,
          status: 'withdrawn' as const,
          respondedAt: past,
          expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24),
        })),
      );
      const res = await send(a, b);
      expect(res.status).toBe(429);
      expect(res.body.error.code).toBe('INTEREST_LIMIT_REACHED');
    });

    it('accepts event context only when both are looking for a partner at the event', async () => {
      const a = await createMember(app);
      const b = await createMember(app);
      const { accessToken: adminToken } = await loginAdmin(app, uniqueIp(), 'event_manager');
      const organizer = await createOrganizer(app, adminToken);
      const event = await createEvent(app, adminToken, organizer.id);
      await publishEvent(app, adminToken, event.id);

      const rejected = await send(a, b, { eventId: event.id });
      expect(rejected.status).toBe(400);

      for (const m of [a, b]) {
        await request(app)
          .put(`/api/v1/events/${event.id}/attendance`)
          .set(bearer(m.accessToken))
          .send({ status: 'going', lookingForPartner: true })
          .expect(200);
      }
      await send(a, b, { eventId: event.id }).expect(201);
      const [inbox] = await received(b);
      expect(inbox?.event).toMatchObject({ id: event.id, name: event.name });

      const accepted = await action(b, inbox?.id ?? '', 'accept');
      expect(accepted.body.data.event.id).toBe(event.id);
    });
  });

  describe('responding', () => {
    async function pendingInterest() {
      const sender = await createMember(app, { name: 'Sender' });
      const receiver = await createMember(app, { name: 'Receiver' });
      const res = await send(sender, receiver).expect(201);
      return { sender, receiver, interestId: res.body.data.interestId as string };
    }

    it('accepts: creates a match visible to both members, once', async () => {
      const { sender, receiver, interestId } = await pendingInterest();
      const res = await action(receiver, interestId, 'accept');
      expect(res.status).toBe(200);
      expect(res.body.data.partner.id).toBe(sender.userId);

      expect((await matchesOf(sender)).map((m) => m.partner.id)).toEqual([receiver.userId]);
      expect((await matchesOf(receiver)).map((m) => m.partner.id)).toEqual([sender.userId]);
      expect(await received(receiver)).toEqual([]);
      expect(await sent(sender)).toEqual([]);

      const again = await action(receiver, interestId, 'accept');
      expect(again.status).toBe(409);
      expect(await Match.count()).toBe(1);

      const detail = await request(app)
        .get(`/api/v1/matches/${res.body.data.id as string}`)
        .set(bearer(sender.accessToken));
      expect(detail.status).toBe(200);
    });

    it('rejects silently: the sender just sees it drop out, and the pair stays apart for a while', async () => {
      const { sender, receiver, interestId } = await pendingInterest();
      await action(receiver, interestId, 'reject').expect(200);
      expect(await sent(sender)).toEqual([]);
      expect(await received(receiver)).toEqual([]);
      expect((await PartnerInterest.findByPk(interestId))?.status).toBe('declined');

      // The sender can't resend, and the receiver no longer appears in their discovery.
      expect((await send(sender, receiver)).body.error.code).toBe('USER_UNAVAILABLE');
      const found = (await request(app).get('/api/v1/partners').set(bearer(sender.accessToken)))
        .body.data as PartnerDto[];
      expect(found.map((p) => p.profile.id)).not.toContain(receiver.userId);
    });

    it('withdraws: only the sender, only while pending', async () => {
      const { sender, receiver, interestId } = await pendingInterest();
      const byReceiver = await request(app)
        .delete(`/api/v1/interests/${interestId}`)
        .set(bearer(receiver.accessToken));
      expect(byReceiver.status).toBe(404);

      await request(app)
        .delete(`/api/v1/interests/${interestId}`)
        .set(bearer(sender.accessToken))
        .expect(200);
      expect(await received(receiver)).toEqual([]);
      expect((await action(receiver, interestId, 'accept')).status).toBe(409);
    });

    it('prevents IDOR: only the receiver can accept or reject', async () => {
      const { sender, interestId } = await pendingInterest();
      const stranger = await createMember(app);
      expect((await action(sender, interestId, 'accept')).status).toBe(404);
      expect((await action(stranger, interestId, 'accept')).status).toBe(404);
      expect((await action(stranger, interestId, 'reject')).status).toBe(404);
      expect(await Match.count()).toBe(0);
    });

    it('cannot accept an expired interest', async () => {
      const { receiver, interestId } = await pendingInterest();
      await db().query(
        `UPDATE partner_interests SET created_at = now() - interval '20 days',
           expires_at = now() - interval '6 days' WHERE id = :id`,
        { replacements: { id: interestId } },
      );
      const res = await action(receiver, interestId, 'accept');
      expect(res.status).toBe(409);
      expect((await PartnerInterest.findByPk(interestId))?.status).toBe('expired');
      expect(await received(receiver)).toEqual([]);
    });
  });

  describe('safety rules', () => {
    it('a block cancels pending interests and ends the match, silently', async () => {
      const a = await createMember(app);
      const b = await createMember(app);
      await send(a, b).expect(201);
      await request(app)
        .post('/api/v1/blocks')
        .set(bearer(b.accessToken))
        .send({ userId: a.userId })
        .expect(201);
      expect(await received(b)).toEqual([]);
      expect(await sent(a)).toEqual([]);
      expect((await PartnerInterest.findOne())?.status).toBe('cancelled');

      const c = await createMember(app);
      const d = await createMember(app);
      await send(c, d).expect(201);
      await send(d, c).expect(201); // match
      await request(app)
        .post('/api/v1/blocks')
        .set(bearer(c.accessToken))
        .send({ userId: d.userId })
        .expect(201);
      expect(await matchesOf(c)).toEqual([]);
      expect(await matchesOf(d)).toEqual([]);
      expect((await Match.findOne())?.status).toBe('blocked');
      expect((await send(d, c)).body.error.code).toBe('USER_UNAVAILABLE');
    });

    it('a report ends the match even without a block', async () => {
      const a = await createMember(app);
      const b = await createMember(app);
      await send(a, b).expect(201);
      const matched = await send(b, a).expect(201);
      await request(app)
        .post('/api/v1/reports')
        .set(bearer(a.accessToken))
        .send({ reportedUserId: b.userId, reason: 'harassment', alsoBlock: false })
        .expect(201);
      expect((await Match.findByPk(matched.body.data.match.id as string))?.status).toBe('closed');
      expect((await send(b, a)).body.error.code).toBe('USER_UNAVAILABLE');
    });

    it('cancels an interest from a member who was suspended before it was accepted', async () => {
      const a = await createMember(app);
      const b = await createMember(app);
      const res = await send(a, b).expect(201);
      await User.update({ status: 'suspended' }, { where: { id: a.userId } });

      expect(await received(b)).toEqual([]);
      const accept = await action(b, res.body.data.interestId as string, 'accept');
      expect(accept.body.error.code).toBe('USER_UNAVAILABLE');
      expect(await Match.count()).toBe(0);

      // Suspended members can't use interests or matches at all.
      expect(
        (await request(app).get('/api/v1/interests/sent').set(bearer(a.accessToken))).status,
      ).toBe(403);
    });

    it('hides a match while the other member is suspended', async () => {
      const a = await createMember(app);
      const b = await createMember(app);
      await send(a, b).expect(201);
      const res = await send(b, a).expect(201);
      await User.update({ status: 'suspended' }, { where: { id: a.userId } });
      expect(await matchesOf(b)).toEqual([]);
      const detail = await request(app)
        .get(`/api/v1/matches/${res.body.data.match.id as string}`)
        .set(bearer(b.accessToken));
      expect(detail.status).toBe(404);
    });

    it('members under review cannot send or accept', async () => {
      const a = await createMember(app);
      const b = await createMember(app);
      const res = await send(a, b).expect(201);
      await User.update(
        { hiddenFromDiscovery: true, hiddenReason: 'p0_report' },
        { where: { id: b.userId } },
      );
      const accept = await action(b, res.body.data.interestId as string, 'accept');
      expect(accept.body.error.code).toBe('INTERACTIONS_RESTRICTED');
      expect((await send(b, a)).body.error.code).toBe('INTERACTIONS_RESTRICTED');
    });
  });

  describe('matches', () => {
    it('lists, shows and unmatches; only participants can see a match', async () => {
      const a = await createMember(app);
      const b = await createMember(app);
      const stranger = await createMember(app);
      await send(a, b).expect(201);
      const matchId = (await send(b, a).expect(201)).body.data.match.id as string;

      expect(
        (await request(app).get(`/api/v1/matches/${matchId}`).set(bearer(stranger.accessToken)))
          .status,
      ).toBe(404);
      expect(
        (
          await request(app)
            .post(`/api/v1/matches/${matchId}/unmatch`)
            .set(bearer(stranger.accessToken))
        ).status,
      ).toBe(404);

      await request(app)
        .post(`/api/v1/matches/${matchId}/unmatch`)
        .set(bearer(a.accessToken))
        .expect(200);
      expect(await matchesOf(a)).toEqual([]);
      expect(await matchesOf(b)).toEqual([]);
      expect((await Match.findByPk(matchId))?.status).toBe('unmatched');

      // After unmatching, a new interest can lead to a new match (never two active ones).
      await send(a, b).expect(201);
      await send(b, a).expect(201);
      expect(await Match.count({ where: { status: 'active' } })).toBe(1);
      expect(await Match.count()).toBe(2);
    });

    it('shows the connection on partner profiles and hides sent/matched members from the list', async () => {
      const a = await createMember(app);
      const b = await createMember(app);
      const c = await createMember(app);
      const interestId = (await send(a, b).expect(201)).body.data.interestId as string;

      const list = (await request(app).get('/api/v1/partners').set(bearer(a.accessToken))).body
        .data as PartnerDto[];
      expect(list.map((p) => p.profile.id)).toEqual([c.userId]);

      const asSender = await request(app)
        .get(`/api/v1/partners/${b.userId}`)
        .set(bearer(a.accessToken));
      expect(asSender.body.data.connection).toEqual({
        status: 'interest_sent',
        interestId,
        matchId: null,
      });
      const asReceiver = await request(app)
        .get(`/api/v1/partners/${a.userId}`)
        .set(bearer(b.accessToken));
      expect(asReceiver.body.data.connection.status).toBe('interest_received');

      const match = await action(b, interestId, 'accept');
      const matched = await request(app)
        .get(`/api/v1/partners/${b.userId}`)
        .set(bearer(a.accessToken));
      expect(matched.body.data.connection).toEqual({
        status: 'matched',
        interestId: null,
        matchId: match.body.data.id,
      });
    });
  });
});
