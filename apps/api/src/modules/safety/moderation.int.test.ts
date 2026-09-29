import { randomUUID } from 'node:crypto';
import type { Express } from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import type {
  AdminReportDetailDto,
  AdminUserDetailDto,
  MySafetyStatusDto,
} from '@garba-partner/shared';
import {
  AdminAuditLog,
  Match,
  PartnerInterest,
  Report,
  SafetyLog,
  User,
  UserSanction,
} from '../../models/index.js';
import { bearer } from '../../test/event-fixtures.js';
import {
  createTestApp,
  hasTestDatabase,
  loginAdmin,
  uniqueIp,
  useTestDatabase,
} from '../../test/helpers.js';
import { createMatchedPair, createMember, type TestMember } from '../../test/member-fixtures.js';
import { expireSanctions } from './sanctions.js';

const DAY_MS = 24 * 60 * 60 * 1000;

describe.skipIf(!hasTestDatabase)('safety and moderation system (integration)', () => {
  const db = useTestDatabase();
  let app: Express;
  let ip: string;

  beforeEach(() => {
    app = createTestApp({ sequelize: db() });
    ip = uniqueIp();
  });

  const send = (m: TestMember, matchId: string, body: string) =>
    request(app)
      .post(`/api/v1/chats/${matchId}/messages`)
      .set(bearer(m.accessToken))
      .send({ clientMessageId: randomUUID(), body });

  const report = (from: TestMember, about: TestMember, reason: string, extra = {}) =>
    request(app)
      .post('/api/v1/reports')
      .set(bearer(from.accessToken))
      .send({ reportedUserId: about.userId, reason, alsoBlock: false, ...extra });

  /** Mutual interest between two existing members → match id. */
  async function matchMembers(a: TestMember, b: TestMember): Promise<string> {
    await request(app)
      .post('/api/v1/interests')
      .set(bearer(a.accessToken))
      .send({ receiverId: b.userId })
      .expect(201);
    const res = await request(app)
      .post('/api/v1/interests')
      .set(bearer(b.accessToken))
      .send({ receiverId: a.userId })
      .expect(201);
    return res.body.data.match.id as string;
  }

  const mySafety = async (m: TestMember) => {
    const res = await request(app).get('/api/v1/me/safety').set(bearer(m.accessToken));
    expect(res.status).toBe(200);
    return res.body.data as MySafetyStatusDto;
  };

  const adminPost = (token: string, path: string, body: object = {}) =>
    request(app).post(`/api/v1/admin${path}`).set(bearer(token)).send(body);

  describe('report reasons', () => {
    it('accepts every product reason and rejects retired ones', async () => {
      const reporter = await createMember(app);
      for (const reason of [
        'fake_profile',
        'harassment',
        'spam',
        'asking_for_money',
        'inappropriate_behavior',
        'impersonation',
        'other',
      ]) {
        const target = await createMember(app);
        const res = await report(reporter, target, reason);
        expect(res.status).toBe(201);
      }
      const target = await createMember(app);
      expect((await report(reporter, target, 'scam_spam')).status).toBe(400);
      expect((await report(reporter, target, 'safety_threat')).status).toBe(400);
    });

    it('prioritises threats and money requests', async () => {
      const reporter = await createMember(app);
      const threat = await createMember(app);
      const money = await createMember(app);
      const spam = await createMember(app);
      await report(reporter, threat, 'threatening_behavior').expect(201);
      await report(reporter, money, 'asking_for_money').expect(201);
      await report(reporter, spam, 'spam').expect(201);
      const priorities = Object.fromEntries(
        (await Report.findAll()).map((r) => [r.reportedUserId, r.priority]),
      );
      expect(priorities).toEqual({ [threat.userId]: 0, [money.userId]: 1, [spam.userId]: 2 });
    });
  });

  describe('no automatic bans', () => {
    it('never suspends or bans on reports alone, however many or urgent', async () => {
      const target = await createMember(app);
      for (let i = 0; i < 6; i += 1) {
        const reporter = await createMember(app);
        await report(reporter, target, i % 2 ? 'threatening_behavior' : 'underage').expect(201);
      }
      const user = await User.findByPk(target.userId);
      // The only automatic protection: hidden from discovery pending review.
      expect(user).toMatchObject({ status: 'active', hiddenFromDiscovery: true });
      expect(user?.chatRestrictedAt).toBeNull();
      expect(await UserSanction.count()).toBe(0);
      expect(await Report.count({ where: { reportedUserId: target.userId } })).toBe(6);
    });

    it('requires a reviewed report before banning', async () => {
      const reporter = await createMember(app);
      const target = await createMember(app);
      const reportId = (await report(reporter, target, 'harassment')).body.data.reportId as string;
      const moderator = await loginAdmin(app, ip, 'moderator');
      const ban = () =>
        adminPost(moderator.accessToken, `/reports/${reportId}/resolve`, {
          action: 'ban',
          note: 'Confirmed repeated harassment',
        });
      const refused = await ban();
      expect(refused.status).toBe(409);
      expect((await User.findByPk(target.userId))?.status).toBe('active');

      const assigned = await adminPost(moderator.accessToken, `/reports/${reportId}/assign`);
      expect(assigned.status).toBe(200);
      expect(assigned.body.data).toMatchObject({
        status: 'in_review',
        assignedAdminId: moderator.adminId,
      });
      expect(await AdminAuditLog.count({ where: { action: 'report.assign' } })).toBe(1);
      expect((await ban()).status).toBe(200);
      const sanction = await UserSanction.findOne({ where: { userId: target.userId } });
      expect(sanction).toMatchObject({
        type: 'ban',
        reasonCode: 'harassment',
        reportId,
        createdByAdminId: moderator.adminId,
      });
    });
  });

  describe('warnings', () => {
    it('warns from a report: the member sees the guideline (never the note) and acknowledges', async () => {
      const reporter = await createMember(app);
      const target = await createMember(app);
      const reportId = (await report(reporter, target, 'asking_for_money')).body.data
        .reportId as string;
      const moderator = await loginAdmin(app, ip, 'moderator');
      const note = 'Asked two members for UPI transfers';
      const resolved = await adminPost(moderator.accessToken, `/reports/${reportId}/resolve`, {
        action: 'warn',
        note,
      });
      expect(resolved.status).toBe(200);
      const detail = resolved.body.data as AdminReportDetailDto;
      expect(detail.status).toBe('resolved');
      expect(detail.sanctions).toHaveLength(1);
      expect(detail.sanctions[0]).toMatchObject({ type: 'warning', note, reportId, active: true });

      const raw = await request(app).get('/api/v1/me/safety').set(bearer(target.accessToken));
      expect(raw.headers['cache-control']).toBe('private, no-store');
      expect(JSON.stringify(raw.body)).not.toContain(note);
      expect(JSON.stringify(raw.body)).not.toContain(reporter.userId);
      const status = raw.body.data as MySafetyStatusDto;
      expect(status).toMatchObject({ accountStatus: 'active', chatRestricted: false });
      expect(status.warnings).toHaveLength(1);
      const [warning] = status.warnings;
      expect(warning?.guideline).toMatchObject({ id: 'never_ask_for_money' });

      // Only the warned member can acknowledge it.
      expect(
        (
          await request(app)
            .post(`/api/v1/me/warnings/${warning?.id ?? ''}/acknowledge`)
            .set(bearer(reporter.accessToken))
        ).status,
      ).toBe(404);
      const ack = await request(app)
        .post(`/api/v1/me/warnings/${warning?.id ?? ''}/acknowledge`)
        .set(bearer(target.accessToken));
      expect(ack.status).toBe(200);
      expect(ack.body.data.acknowledgedAt).toEqual(expect.any(String));
      expect((await mySafety(target)).warnings).toEqual([]);

      const audit = await AdminAuditLog.findOne({ where: { action: 'user.warn' } });
      expect(audit).toMatchObject({ targetType: 'user', targetId: target.userId });
      expect(audit?.metadata).toMatchObject({ reason: note, reasonCode: 'asking_for_money' });
    });

    it('warns directly from the user page with a guideline category', async () => {
      const member = await createMember(app);
      const moderator = await loginAdmin(app, ip, 'moderator');
      const res = await adminPost(moderator.accessToken, `/users/${member.userId}/warn`, {
        reason: 'Pressuring members to meet privately',
        reasonCode: 'harassment',
      });
      expect(res.status).toBe(200);
      expect((res.body.data as AdminUserDetailDto).sanctions[0]).toMatchObject({
        type: 'warning',
        reasonCode: 'harassment',
      });
      expect((await mySafety(member)).warnings[0]?.guideline?.id).toBe('be_respectful');
      // Durations are for suspensions and chat restrictions only.
      const bad = await adminPost(moderator.accessToken, `/users/${member.userId}/warn`, {
        reason: 'Another warning here',
        durationDays: 3,
      });
      expect(bad.status).toBe(400);
    });
  });

  describe('chat restriction', () => {
    it('stops sending (not reading) until lifted, and is audited', async () => {
      const { a, b, matchId } = await createMatchedPair(app);
      await send(a, matchId, 'Hi there').expect(201);
      const moderator = await loginAdmin(app, ip, 'moderator');
      const restricted = await adminPost(
        moderator.accessToken,
        `/users/${b.userId}/restrict-chat`,
        { reason: 'Aggressive messages reported', reasonCode: 'harassment' },
      );
      expect(restricted.status).toBe(200);
      expect((restricted.body.data as AdminUserDetailDto).chatRestricted).toBe(true);

      const refused = await send(b, matchId, 'Why did you ignore me');
      expect(refused.status).toBe(403);
      expect(refused.body.error.code).toBe('CHAT_RESTRICTED');
      // Reading still works, and the other member can still write.
      expect(
        (await request(app).get(`/api/v1/chats/${matchId}/messages`).set(bearer(b.accessToken)))
          .status,
      ).toBe(200);
      await send(a, matchId, 'Please be respectful').expect(201);
      expect(await mySafety(b)).toMatchObject({ chatRestricted: true, chatRestrictedUntil: null });

      // Applying it twice is a conflict; lifting restores sending.
      expect(
        (
          await adminPost(moderator.accessToken, `/users/${b.userId}/restrict-chat`, {
            reason: 'Second restriction attempt',
          })
        ).status,
      ).toBe(409);
      const lifted = await adminPost(
        moderator.accessToken,
        `/users/${b.userId}/lift-chat-restriction`,
        { reason: 'Reviewed, restriction no longer needed' },
      );
      expect(lifted.status).toBe(200);
      await send(b, matchId, 'Sorry about earlier').expect(201);
      const sanction = await UserSanction.findOne({ where: { userId: b.userId } });
      expect(sanction?.revokedAt).not.toBeNull();
      expect(sanction?.revokedByAdminId).toBe(moderator.adminId);
      const actions = (await AdminAuditLog.findAll({ order: [['createdAt', 'ASC']] })).map(
        (log) => log.action,
      );
      expect(actions).toEqual(['user.restrict_chat', 'user.lift_chat_restriction']);
    });

    it('can be timed from a report and ends on its own', async () => {
      const { a, b, matchId } = await createMatchedPair(app);
      const bad = await send(b, matchId, 'You owe me a reply');
      const reportId = (await report(a, b, 'harassment', { messageId: bad.body.data.id as string }))
        .body.data.reportId as string;
      const moderator = await loginAdmin(app, ip, 'moderator');
      const res = await adminPost(moderator.accessToken, `/reports/${reportId}/resolve`, {
        action: 'restrict_chat',
        note: 'Hostile messages, first offence',
        durationDays: 3,
      });
      expect(res.status).toBe(200);
      const status = await mySafety(b);
      expect(status.chatRestricted).toBe(true);
      const until = Date.parse(status.chatRestrictedUntil ?? '');
      expect(until - Date.now()).toBeGreaterThan(2.9 * DAY_MS);
      expect(until - Date.now()).toBeLessThan(3.1 * DAY_MS);

      expect(await expireSanctions(db(), new Date())).toEqual([]);
      const expired = await expireSanctions(db(), new Date(Date.now() + 4 * DAY_MS));
      expect(expired).toEqual([
        expect.objectContaining({ userId: b.userId, type: 'chat_restriction' }),
      ]);
      expect(await mySafety(b)).toMatchObject({ chatRestricted: false });
    });

    it('rejects a duration on actions that cannot have one', async () => {
      const reporter = await createMember(app);
      const target = await createMember(app);
      const reportId = (await report(reporter, target, 'spam')).body.data.reportId as string;
      const moderator = await loginAdmin(app, ip, 'moderator');
      const res = await adminPost(moderator.accessToken, `/reports/${reportId}/resolve`, {
        action: 'dismiss',
        note: 'No violation found',
        durationDays: 7,
      });
      expect(res.status).toBe(400);
      expect((await Report.findByPk(reportId))?.status).toBe('open');
    });
  });

  describe('suspension and ban', () => {
    it('suspends for a set time; the expiry job reactivates the account', async () => {
      const member = await createMember(app);
      const moderator = await loginAdmin(app, ip, 'moderator');
      const res = await adminPost(moderator.accessToken, `/users/${member.userId}/suspend`, {
        reason: 'Cooling-off period after reports',
        reasonCode: 'inappropriate_behavior',
        durationDays: 1,
      });
      expect(res.status).toBe(200);
      const detail = res.body.data as AdminUserDetailDto;
      expect(detail.accountStatus).toBe('suspended');
      expect(detail.sanctions[0]).toMatchObject({ type: 'suspension', active: true });
      expect(detail.sanctions[0]?.endsAt).toEqual(expect.any(String));

      await expireSanctions(db(), new Date(Date.now() + 2 * DAY_MS));
      expect((await User.findByPk(member.userId))?.status).toBe('active');
      const sanction = await UserSanction.findOne({ where: { userId: member.userId } });
      expect(sanction?.expiredAt).not.toBeNull();
    });

    it('bans permanently: matches end, interests are cancelled, a running suspension cannot undo it', async () => {
      const { a, b, matchId } = await createMatchedPair(app);
      const admirer = await createMember(app);
      await request(app)
        .post('/api/v1/interests')
        .set(bearer(admirer.accessToken))
        .send({ receiverId: b.userId })
        .expect(201);
      const moderator = await loginAdmin(app, ip, 'moderator');
      await adminPost(moderator.accessToken, `/users/${b.userId}/suspend`, {
        reason: 'Suspended while we investigate',
        durationDays: 1,
      }).expect(200);
      const banned = await adminPost(moderator.accessToken, `/users/${b.userId}/ban`, {
        reason: 'Confirmed scam attempts on several members',
        reasonCode: 'asking_for_money',
      });
      expect(banned.status).toBe(200);
      expect((await Match.findByPk(matchId))?.status).toBe('closed');
      expect(
        await PartnerInterest.count({ where: { receiverId: b.userId, status: 'pending' } }),
      ).toBe(0);
      expect((await send(a, matchId, 'Hello?')).status).toBe(409);

      // The earlier suspension was superseded, so its expiry never reactivates a ban.
      await expireSanctions(db(), new Date(Date.now() + 2 * DAY_MS));
      expect((await User.findByPk(b.userId))?.status).toBe('banned');
      // Banning twice is a conflict; so is any lesser sanction on a banned account.
      expect(
        (
          await adminPost(moderator.accessToken, `/users/${b.userId}/ban`, {
            reason: 'Ban again for good measure',
          })
        ).status,
      ).toBe(409);
      expect(
        (
          await adminPost(moderator.accessToken, `/users/${b.userId}/warn`, {
            reason: 'Warn a banned account',
          })
        ).status,
      ).toBe(409);
      const audit = await AdminAuditLog.findOne({ where: { action: 'user.ban' } });
      expect(audit?.metadata).toMatchObject({
        to: 'banned',
        matchesEnded: 1,
        cancelledInterests: 1,
      });
    });

    it('lets only super admins lift a ban', async () => {
      const member = await createMember(app);
      const moderator = await loginAdmin(app, ip, 'moderator');
      await adminPost(moderator.accessToken, `/users/${member.userId}/ban`, {
        reason: 'Impersonating an event organizer',
        reasonCode: 'impersonation',
      }).expect(200);
      const reason = { reason: 'Appeal accepted after review' };
      expect(
        (await adminPost(moderator.accessToken, `/users/${member.userId}/unban`, reason)).status,
      ).toBe(403);
      const superAdmin = await loginAdmin(app, ip, 'super_admin');
      const res = await adminPost(superAdmin.accessToken, `/users/${member.userId}/unban`, reason);
      expect(res.status).toBe(200);
      expect((res.body.data as AdminUserDetailDto).accountStatus).toBe('active');
      const sanction = await UserSanction.findOne({ where: { userId: member.userId } });
      expect(sanction).toMatchObject({
        revokeReason: reason.reason,
        revokedByAdminId: superAdmin.adminId,
      });
      expect(await AdminAuditLog.count({ where: { action: 'user.unban' } })).toBe(1);
    });

    it('closes a second report about an already-suspended member without a new sanction', async () => {
      const target = await createMember(app);
      const first = await createMember(app);
      const second = await createMember(app);
      const r1 = (await report(first, target, 'harassment')).body.data.reportId as string;
      const r2 = (await report(second, target, 'harassment')).body.data.reportId as string;
      const moderator = await loginAdmin(app, ip, 'moderator');
      const resolve = (id: string) =>
        adminPost(moderator.accessToken, `/reports/${id}/resolve`, {
          action: 'suspend',
          note: 'Harassment confirmed by two members',
        });
      expect((await resolve(r1)).status).toBe(200);
      expect((await resolve(r2)).status).toBe(200);
      expect(await UserSanction.count({ where: { userId: target.userId } })).toBe(1);
      const audits = await AdminAuditLog.findAll({ where: { action: 'report.resolve' } });
      expect(audits.map((log) => log.metadata.sanctionAlreadyActive).sort()).toEqual([false, true]);
    });

    it('keeps sanctions away from admins without users:sanction', async () => {
      const member = await createMember(app);
      const eventManager = await loginAdmin(app, ip, 'event_manager');
      for (const path of ['warn', 'restrict-chat', 'suspend', 'ban']) {
        const res = await adminPost(eventManager.accessToken, `/users/${member.userId}/${path}`, {
          reason: 'Not allowed to do this',
        });
        expect(res.status).toBe(403);
      }
      const reporter = await createMember(app);
      const reportId = (await report(reporter, member, 'spam')).body.data.reportId as string;
      expect(
        (await adminPost(eventManager.accessToken, `/reports/${reportId}/assign`)).status,
      ).toBe(403);
      expect(await UserSanction.count()).toBe(0);
    });
  });

  describe('suspicious activity detection', () => {
    it('flags repeated money requests for review, hides the sender, and never sanctions', async () => {
      const scammer = await createMember(app, { name: 'Scammer' });
      const chatA = await matchMembers(await createMember(app, { gender: 'woman' }), scammer);
      const chatB = await matchMembers(await createMember(app, { gender: 'woman' }), scammer);
      const sent = await send(scammer, chatA, 'Can you send me 2000 on gpay? urgent');
      expect(sent.status).toBe(201);
      // Moderation flags are never exposed to members.
      expect(sent.body.data).not.toHaveProperty('containsMoneyRequest');
      await send(scammer, chatB, 'I need money for my ticket, please transfer').expect(201);
      expect(await Report.count({ where: { source: 'system' } })).toBe(0);
      await send(scammer, chatA, 'my upi is scam.pay@okaxis').expect(201);
      await send(scammer, chatB, 'Pay me back tomorrow via paytm').expect(201);

      const flags = await Report.findAll({ where: { source: 'system' } });
      expect(flags).toHaveLength(1); // one open flag per member and trigger
      expect(flags[0]).toMatchObject({
        reportedUserId: scammer.userId,
        reporterId: null,
        reason: 'asking_for_money',
        priority: 1,
        status: 'open',
      });
      expect(flags[0]?.evidence.trigger).toBe('money_requests');
      // Evidence holds only the suspected member's own messages.
      expect(flags[0]?.evidence.messages?.every((m) => m.senderRole === 'reported')).toBe(true);

      const user = await User.findByPk(scammer.userId);
      expect(user).toMatchObject({
        status: 'active',
        hiddenFromDiscovery: true,
        hiddenReason: 'suspicious_activity',
      });
      expect(await UserSanction.count()).toBe(0);
      expect(await SafetyLog.count({ where: { eventType: 'suspicious.money_requests' } })).toBe(1);

      // Moderators see it in the queue, filterable as an automated flag.
      const moderator = await loginAdmin(app, ip, 'moderator');
      const queue = await request(app)
        .get('/api/v1/admin/reports?source=system')
        .set(bearer(moderator.accessToken));
      expect(queue.body.data).toEqual([
        expect.objectContaining({ trigger: 'money_requests', reporter: null }),
      ]);
      const detail = await request(app)
        .get(`/api/v1/admin/reports/${flags[0]?.id ?? ''}`)
        .set(bearer(moderator.accessToken));
      expect((detail.body.data as AdminReportDetailDto).evidence.signals).toMatchObject({
        moneyRequestMessages: 4,
        chats: 2,
      });
    });

    it('does not flag talk about ticket prices', async () => {
      const { a, b, matchId } = await createMatchedPair(app);
      for (const body of [
        'The pass is ₹500 at the gate',
        'Rs 300 for the early bird tickets',
        'Send me the location please',
        'Give me a call when you reach',
      ]) {
        await send(a, matchId, body).expect(201);
        await send(b, matchId, body).expect(201);
      }
      expect(await Report.count()).toBe(0);
    });

    it('flags the same message sent to many chats as spam', async () => {
      const spammer = await createMember(app);
      const text = 'Follow my dance page for exclusive garba classes!!';
      for (let i = 0; i < 4; i += 1) {
        const other = await createMember(app, { gender: 'woman' });
        const matchId = await matchMembers(other, spammer);
        await send(spammer, matchId, text).expect(201);
      }
      const flag = await Report.findOne({ where: { source: 'system' } });
      expect(flag).toMatchObject({ reason: 'spam', reportedUserId: spammer.userId });
      expect(flag?.evidence.signals).toMatchObject({ sameMessageChats: 4 });
      expect((await User.findByPk(spammer.userId))?.status).toBe('active');
    });

    it('flags a member many people block, without hiding them', async () => {
      const target = await createMember(app);
      for (let i = 0; i < 5; i += 1) {
        const blocker = await createMember(app);
        await request(app)
          .post('/api/v1/blocks')
          .set(bearer(blocker.accessToken))
          .send({ userId: target.userId })
          .expect(201);
      }
      const flag = await Report.findOne({ where: { source: 'system' } });
      expect(flag).toMatchObject({ reason: 'other', reportedUserId: target.userId });
      expect(flag?.evidence.trigger).toBe('frequently_blocked');
      expect(await User.findByPk(target.userId)).toMatchObject({
        status: 'active',
        hiddenFromDiscovery: false,
      });
    });
  });

  describe('blocking churn', () => {
    it('logs unblocks and keeps them idempotent', async () => {
      const member = await createMember(app);
      const other = await createMember(app);
      const auth = bearer(member.accessToken);
      await request(app)
        .post('/api/v1/blocks')
        .set(auth)
        .send({ userId: other.userId })
        .expect(201);
      await request(app).delete(`/api/v1/blocks/${other.userId}`).set(auth).expect(200);
      await request(app).delete(`/api/v1/blocks/${other.userId}`).set(auth).expect(200);
      const logs = await SafetyLog.findAll({ where: { eventType: 'safety.block_removed' } });
      expect(logs).toHaveLength(1);
      expect(logs[0]?.metadata).toEqual({ unblockedUserId: other.userId });
    });
  });

  describe('log viewers', () => {
    it('shows safety logs to moderators and audit logs to super admins, without IP hashes', async () => {
      const member = await createMember(app);
      const other = await createMember(app);
      await request(app)
        .post('/api/v1/blocks')
        .set(bearer(member.accessToken))
        .send({ userId: other.userId })
        .expect(201);
      const moderator = await loginAdmin(app, ip, 'moderator');
      await adminPost(moderator.accessToken, `/users/${other.userId}/warn`, {
        reason: 'Reminder about the guidelines',
      }).expect(200);

      const eventManager = await loginAdmin(app, ip, 'event_manager');
      const get = (token: string, path: string) =>
        request(app).get(`/api/v1/admin${path}`).set(bearer(token));
      expect((await get(eventManager.accessToken, '/safety-logs')).status).toBe(403);
      expect((await get(moderator.accessToken, '/audit-logs')).status).toBe(403);

      const safety = await get(
        moderator.accessToken,
        '/safety-logs?eventType=safety.block_created',
      );
      expect(safety.status).toBe(200);
      expect(safety.body.data).toEqual([
        expect.objectContaining({ eventType: 'safety.block_created', userId: member.userId }),
      ]);
      expect(JSON.stringify(safety.body)).not.toContain('ipHash');

      const superAdmin = await loginAdmin(app, ip, 'super_admin');
      const audit = await get(superAdmin.accessToken, `/audit-logs?targetId=${other.userId}`);
      expect(audit.status).toBe(200);
      expect(audit.body.data).toEqual([
        expect.objectContaining({
          action: 'user.warn',
          targetType: 'user',
          admin: expect.objectContaining({ id: moderator.adminId }),
        }),
      ]);
      expect(JSON.stringify(audit.body)).not.toContain('ipHash');
      expect((await get(superAdmin.accessToken, '/audit-logs?targetId=nope')).status).toBe(400);
    });
  });
});
