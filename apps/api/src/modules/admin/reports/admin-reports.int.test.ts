import { randomUUID } from 'node:crypto';
import type { Express } from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import type {
  AdminReportDetailDto,
  AdminReportListItemDto,
  MessageDto,
} from '@garba-partner/shared';
import { AdminAuditLog, Match, User, UserSession } from '../../../models/index.js';
import { bearer } from '../../../test/event-fixtures.js';
import {
  createTestApp,
  hasTestDatabase,
  loginAdmin,
  uniqueIp,
  useTestDatabase,
} from '../../../test/helpers.js';
import { createMatchedPair, createMember, type TestMember } from '../../../test/member-fixtures.js';

describe.skipIf(!hasTestDatabase)('admin reports and conversation review (integration)', () => {
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

  /** A reports B over a chat message. */
  async function chatReport(reason = 'harassment') {
    const { a, b, matchId } = await createMatchedPair(app);
    await send(a, matchId, 'Hi, nice to match!').expect(201);
    const bad = (await send(b, matchId, 'Send me your address now')).body.data as MessageDto;
    await send(b, matchId, 'Reply or else').expect(201);
    const res = await request(app)
      .post('/api/v1/reports')
      .set(bearer(a.accessToken))
      .send({ reportedUserId: b.userId, reason, messageId: bad.id, alsoBlock: false });
    expect(res.status).toBe(201);
    return { a, b, matchId, bad, reportId: res.body.data.reportId as string };
  }

  it('lets only admins with reports:manage see the queue', async () => {
    await chatReport();
    const member = await createMember(app);
    expect((await request(app).get('/api/v1/admin/reports')).status).toBe(401);
    expect(
      (await request(app).get('/api/v1/admin/reports').set(bearer(member.accessToken))).status,
    ).toBe(401);
    const eventManager = await loginAdmin(app, ip, 'event_manager');
    expect(
      (await request(app).get('/api/v1/admin/reports').set(bearer(eventManager.accessToken)))
        .status,
    ).toBe(403);

    const moderator = await loginAdmin(app, ip, 'moderator');
    const res = await request(app).get('/api/v1/admin/reports').set(bearer(moderator.accessToken));
    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toBe('no-store');
    const [item] = res.body.data as AdminReportListItemDto[];
    expect(item).toMatchObject({ reason: 'harassment', status: 'open', involvesChat: true });
  });

  it('orders the queue by priority, then age', async () => {
    const low = await chatReport('other');
    const urgent = await chatReport('threatening_behavior');
    const moderator = await loginAdmin(app, ip, 'moderator');
    const res = await request(app).get('/api/v1/admin/reports').set(bearer(moderator.accessToken));
    expect((res.body.data as AdminReportListItemDto[]).map((r) => r.id)).toEqual([
      urgent.reportId,
      low.reportId,
    ]);
  });

  it('shows the evidence snapshot without opening the conversation', async () => {
    const { reportId, bad, a } = await chatReport();
    const moderator = await loginAdmin(app, ip, 'moderator');
    const res = await request(app)
      .get(`/api/v1/admin/reports/${reportId}`)
      .set(bearer(moderator.accessToken));
    const detail = res.body.data as AdminReportDetailDto;
    expect(detail.conversationAvailable).toBe(true);
    expect(detail.evidence.messages.map((m) => [m.senderRole, m.body, m.reported])).toEqual([
      ['reporter', 'Hi, nice to match!', false],
      ['reported', 'Send me your address now', true],
    ]);
    expect(detail.evidence.messages[1]?.id).toBe(bad.id);
    expect(JSON.stringify(res.body)).not.toContain(a.phone);
    // Viewing the report is not a conversation access.
    expect(await AdminAuditLog.count({ where: { action: 'report.conversation_view' } })).toBe(0);
  });

  it('opens the conversation only for open chat reports, audited, and marks the report in review', async () => {
    const { reportId } = await chatReport();
    const moderator = await loginAdmin(app, ip, 'moderator');
    const url = `/api/v1/admin/reports/${reportId}/conversation`;

    const res = await request(app).get(url).set(bearer(moderator.accessToken));
    expect(res.status).toBe(200);
    expect(res.body.data.messages.map((m: { body: string }) => m.body)).toEqual([
      'Hi, nice to match!',
      'Send me your address now',
      'Reply or else',
    ]);
    const audit = await AdminAuditLog.findOne({ where: { action: 'report.conversation_view' } });
    expect(audit).toMatchObject({
      adminId: moderator.adminId,
      targetType: 'report',
      targetId: reportId,
    });

    const detail = await request(app)
      .get(`/api/v1/admin/reports/${reportId}`)
      .set(bearer(moderator.accessToken));
    expect(detail.body.data).toMatchObject({
      status: 'in_review',
      assignedAdminId: moderator.adminId,
    });

    // After resolution the live conversation is closed to moderators (evidence remains).
    await request(app)
      .post(`/api/v1/admin/reports/${reportId}/resolve`)
      .set(bearer(moderator.accessToken))
      .send({ action: 'warn', note: 'Warned about pressure tactics' })
      .expect(200);
    expect((await request(app).get(url).set(bearer(moderator.accessToken))).status).toBe(409);
  });

  it('never opens a conversation for a report that is not about chat', async () => {
    const a = await createMember(app);
    const b = await createMember(app);
    const res = await request(app)
      .post('/api/v1/reports')
      .set(bearer(a.accessToken))
      .send({ reportedUserId: b.userId, reason: 'fake_profile' })
      .expect(201);
    const moderator = await loginAdmin(app, ip, 'moderator');
    const conversation = await request(app)
      .get(`/api/v1/admin/reports/${res.body.data.reportId as string}/conversation`)
      .set(bearer(moderator.accessToken));
    expect(conversation.status).toBe(409);
    expect(await AdminAuditLog.count({ where: { action: 'report.conversation_view' } })).toBe(0);
  });

  it('resolves with a suspension: sessions revoked, account suspended, audited', async () => {
    const { b, reportId } = await chatReport();
    const moderator = await loginAdmin(app, ip, 'moderator');
    const res = await request(app)
      .post(`/api/v1/admin/reports/${reportId}/resolve`)
      .set(bearer(moderator.accessToken))
      .send({ action: 'suspend', note: 'Threatening messages' });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      status: 'resolved',
      resolution: { action: 'suspend', note: 'Threatening messages' },
    });
    expect((await User.findByPk(b.userId))?.status).toBe('suspended');
    expect(await UserSession.count({ where: { userId: b.userId, revokedAt: null } })).toBe(0);
    expect(await AdminAuditLog.count({ where: { action: 'report.resolve' } })).toBe(1);

    const again = await request(app)
      .post(`/api/v1/admin/reports/${reportId}/resolve`)
      .set(bearer(moderator.accessToken))
      .send({ action: 'dismiss', note: 'Second resolution' });
    expect(again.status).toBe(409);
  });

  it('resolves with a ban: every active match of the member ends', async () => {
    const { b, reportId } = await chatReport();
    const other = await createMember(app, { gender: 'woman' });
    await request(app)
      .post('/api/v1/interests')
      .set(bearer(other.accessToken))
      .send({ receiverId: b.userId })
      .expect(201);
    const matched = await request(app)
      .post('/api/v1/interests')
      .set(bearer(b.accessToken))
      .send({ receiverId: other.userId })
      .expect(201);

    const moderator = await loginAdmin(app, ip, 'moderator');
    // Never on an unreviewed report: the moderator must take it into review first.
    await request(app)
      .post(`/api/v1/admin/reports/${reportId}/resolve`)
      .set(bearer(moderator.accessToken))
      .send({ action: 'ban', note: 'Repeated harassment' })
      .expect(409);
    expect((await User.findByPk(b.userId))?.status).toBe('active');
    await request(app)
      .post(`/api/v1/admin/reports/${reportId}/assign`)
      .set(bearer(moderator.accessToken))
      .expect(200);
    await request(app)
      .post(`/api/v1/admin/reports/${reportId}/resolve`)
      .set(bearer(moderator.accessToken))
      .send({ action: 'ban', note: 'Repeated harassment' })
      .expect(200);
    expect((await User.findByPk(b.userId))?.status).toBe('banned');
    expect((await Match.findByPk(matched.body.data.match.id as string))?.status).toBe('closed');
  });

  it('dismisses and can clear the automatic hide', async () => {
    const { b, reportId } = await chatReport('threatening_behavior'); // P0 → auto-hidden
    expect((await User.findByPk(b.userId))?.hiddenFromDiscovery).toBe(true);
    const moderator = await loginAdmin(app, ip, 'moderator');
    const res = await request(app)
      .post(`/api/v1/admin/reports/${reportId}/resolve`)
      .set(bearer(moderator.accessToken))
      .send({ action: 'dismiss', note: 'Misunderstanding', clearAutoHide: true });
    expect(res.body.data.status).toBe('dismissed');
    expect((await User.findByPk(b.userId))?.hiddenFromDiscovery).toBe(false);
  });
});
