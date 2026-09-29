import type { Express } from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import type { PartnerDto } from '@garba-partner/shared';
import { AdminAuditLog, Match, PartnerInterest } from '../../../models/index.js';
import { bearer } from '../../../test/event-fixtures.js';
import {
  createTestApp,
  hasTestDatabase,
  loginAdmin,
  uniqueIp,
  useTestDatabase,
} from '../../../test/helpers.js';
import { createMember, type TestMember } from '../../../test/member-fixtures.js';

describe.skipIf(!hasTestDatabase)('admin match moderation (integration)', () => {
  const db = useTestDatabase();
  let app: Express;
  let ip: string;

  beforeEach(() => {
    app = createTestApp({ sequelize: db() });
    ip = uniqueIp();
  });

  const send = (from: TestMember, to: TestMember) =>
    request(app)
      .post('/api/v1/interests')
      .set(bearer(from.accessToken))
      .send({ receiverId: to.userId });

  async function matchedPair() {
    const a = await createMember(app, { name: 'Asha' });
    const b = await createMember(app, { name: 'Bhavin' });
    await send(a, b).expect(201);
    const res = await send(b, a).expect(201);
    return { a, b, matchId: res.body.data.match.id as string };
  }

  it('shows match history and connection counts to admins with users:view only', async () => {
    const { a, b, matchId } = await matchedPair();
    const c = await createMember(app);
    await send(c, a).expect(201);

    const moderator = await loginAdmin(app, ip, 'moderator');
    const list = await request(app)
      .get(`/api/v1/admin/users/${a.userId}/matches`)
      .set(bearer(moderator.accessToken));
    expect(list.status).toBe(200);
    expect(list.body.data).toEqual([
      expect.objectContaining({
        id: matchId,
        status: 'active',
        partner: { id: b.userId, name: 'Bhavin' },
      }),
    ]);
    expect(JSON.stringify(list.body)).not.toContain(b.phone);

    const detail = await request(app)
      .get(`/api/v1/admin/users/${a.userId}`)
      .set(bearer(moderator.accessToken));
    expect(detail.body.data).toMatchObject({
      interactionsRestricted: false,
      connections: {
        activeMatches: 1,
        pendingInterestsSent: 0,
        pendingInterestsReceived: 1,
        interestsSentLast24h: 1,
      },
    });

    const eventManager = await loginAdmin(app, ip, 'event_manager');
    expect(
      (
        await request(app)
          .get(`/api/v1/admin/users/${a.userId}/matches`)
          .set(bearer(eventManager.accessToken))
      ).status,
    ).toBe(403);
    expect(
      (await request(app).get(`/api/v1/admin/users/${a.userId}/matches`).set(bearer(a.accessToken)))
        .status,
    ).toBe(401);
  });

  it('closes a match (users:sanction), audited, and both members lose it', async () => {
    const { a, b, matchId } = await matchedPair();
    const eventManager = await loginAdmin(app, ip, 'event_manager');
    expect(
      (
        await request(app)
          .post(`/api/v1/admin/matches/${matchId}/close`)
          .set(bearer(eventManager.accessToken))
          .send({ reason: 'Harassment reported off-platform' })
      ).status,
    ).toBe(403);

    const moderator = await loginAdmin(app, ip, 'moderator');
    const noReason = await request(app)
      .post(`/api/v1/admin/matches/${matchId}/close`)
      .set(bearer(moderator.accessToken))
      .send({});
    expect(noReason.status).toBe(400);

    const closed = await request(app)
      .post(`/api/v1/admin/matches/${matchId}/close`)
      .set(bearer(moderator.accessToken))
      .send({ reason: 'Harassment reported off-platform' });
    expect(closed.status).toBe(200);
    expect(closed.body.data.status).toBe('closed');
    expect((await Match.findByPk(matchId))?.endedByAdminId).toBe(moderator.adminId);

    for (const m of [a, b]) {
      const res = await request(app).get('/api/v1/matches').set(bearer(m.accessToken));
      expect(res.body.data).toEqual([]);
    }
    const audit = await AdminAuditLog.findOne({ where: { action: 'match.close' } });
    expect(audit).toMatchObject({ targetType: 'match', targetId: matchId });

    const again = await request(app)
      .post(`/api/v1/admin/matches/${matchId}/close`)
      .set(bearer(moderator.accessToken))
      .send({ reason: 'Second attempt' });
    expect(again.status).toBe(409);
  });

  it('restricts a member from sending or accepting interests, and lifts it', async () => {
    const a = await createMember(app);
    const b = await createMember(app);
    const c = await createMember(app);
    const pending = await send(a, b).expect(201);
    await send(c, a).expect(201);

    const moderator = await loginAdmin(app, ip, 'moderator');
    const restrict = await request(app)
      .post(`/api/v1/admin/users/${a.userId}/restrict-interactions`)
      .set(bearer(moderator.accessToken))
      .send({ reason: 'Sending unwanted interests' });
    expect(restrict.status).toBe(200);
    expect(restrict.body.data.interactionsRestricted).toBe(true);
    expect((await PartnerInterest.findByPk(pending.body.data.interestId as string))?.status).toBe(
      'cancelled',
    );
    expect(await PartnerInterest.count({ where: { status: 'pending' } })).toBe(0);

    expect((await send(a, b)).body.error.code).toBe('INTERACTIONS_RESTRICTED');
    // Restricted members are left out of other members' discovery.
    const found = (await request(app).get('/api/v1/partners').set(bearer(b.accessToken))).body
      .data as PartnerDto[];
    expect(found.map((p) => p.profile.id)).not.toContain(a.userId);
    expect(
      (
        await request(app)
          .post(`/api/v1/admin/users/${a.userId}/restrict-interactions`)
          .set(bearer(moderator.accessToken))
          .send({ reason: 'Again' })
      ).status,
    ).toBe(409);

    await request(app)
      .post(`/api/v1/admin/users/${a.userId}/lift-interaction-restriction`)
      .set(bearer(moderator.accessToken))
      .send({ reason: 'Warning given' })
      .expect(200);
    await send(a, b).expect(201);

    const actions = (await AdminAuditLog.findAll({ where: { targetId: a.userId } })).map(
      (entry) => entry.action,
    );
    expect(actions.sort()).toEqual([
      'user.lift_interaction_restriction',
      'user.restrict_interactions',
    ]);
  });
});
