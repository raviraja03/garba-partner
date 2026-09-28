import type { Express } from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { addDays, todayInIndia } from '@garba-partner/shared';
import { AdminAuditLog, UserSession } from '../../../models/index.js';
import {
  createTestApp,
  createTestEnv,
  hasTestDatabase,
  loginAdmin,
  loginMember,
  makeImage,
  uniqueIp,
  useTestDatabase,
} from '../../../test/helpers.js';

const AHMEDABAD = 'c1000000-0000-4000-8000-000000000001';
const env = createTestEnv();

describe.skipIf(!hasTestDatabase)('admin user management (integration)', () => {
  const db = useTestDatabase();
  let app: Express;
  let ip: string;

  beforeEach(() => {
    app = createTestApp({ sequelize: db(), env });
    ip = uniqueIp();
  });

  const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

  async function memberWithProfile(name: string, withPhoto = false) {
    const member = await loginMember(app, ip);
    await request(app)
      .post('/api/v1/me/profile')
      .set(bearer(member.accessToken))
      .send({
        name,
        dateOfBirth: addDays(todayInIndia(), -10_000),
        gender: 'woman',
        cityId: AHMEDABAD,
        garbaLevel: 'beginner',
        instagramId: 'private.handle',
        confirmsAdult: true,
        acceptTerms: true,
      })
      .expect(201);
    if (withPhoto) {
      await request(app)
        .post('/api/v1/me/profile/image')
        .set(bearer(member.accessToken))
        .attach('image', await makeImage({ width: 600, height: 600 }), {
          filename: 'a.jpg',
          contentType: 'image/jpeg',
        })
        .expect(200);
    }
    return member;
  }

  it('requires admin authentication and the users:view permission', async () => {
    expect((await request(app).get('/api/v1/admin/users')).status).toBe(401);

    const member = await loginMember(app, ip);
    expect(
      (await request(app).get('/api/v1/admin/users').set(bearer(member.accessToken))).status,
    ).toBe(401);

    const eventManager = await loginAdmin(app, ip, 'event_manager');
    const res = await request(app).get('/api/v1/admin/users').set(bearer(eventManager.accessToken));
    expect(res.status).toBe(403);
  });

  it('lists users with profile status and completion, never phone data', async () => {
    const complete = await memberWithProfile('Kavya', true);
    const incomplete = await memberWithProfile('Rohan');
    const noProfile = await loginMember(app, ip);
    const { accessToken } = await loginAdmin(app, ip, 'moderator');

    const res = await request(app).get('/api/v1/admin/users').set(bearer(accessToken));

    expect(res.status).toBe(200);
    const byId = new Map<string, Record<string, unknown>>(
      (res.body.data as Record<string, unknown>[]).map((item) => [item.id as string, item]),
    );
    expect(byId.get(complete.userId)).toMatchObject({
      name: 'Kavya',
      profileStatus: 'complete',
      completionPercentage: 75, // required fields (70) + Instagram (5)
      accountStatus: 'active',
      city: 'Ahmedabad',
    });
    expect(byId.get(incomplete.userId)).toMatchObject({ profileStatus: 'incomplete' });
    expect(byId.get(noProfile.userId)).toMatchObject({ name: null, profileStatus: 'not_started' });

    const serialized = JSON.stringify(res.body);
    for (const member of [complete, incomplete, noProfile])
      expect(serialized).not.toContain(member.phone);
    expect(serialized).not.toMatch(/phone/i);
  });

  it('searches by name, by phone number (matched by hash) and by ID, and filters by status', async () => {
    const kavya = await memberWithProfile('Kavya');
    await memberWithProfile('Rohan');
    const { accessToken } = await loginAdmin(app, ip, 'moderator');
    const search = (query: Record<string, string>) =>
      request(app).get('/api/v1/admin/users').query(query).set(bearer(accessToken));

    expect((await search({ q: 'kav' })).body.data.map((u: { id: string }) => u.id)).toEqual([
      kavya.userId,
    ]);
    expect(
      (await search({ q: `+91 ${kavya.phone}` })).body.data.map((u: { id: string }) => u.id),
    ).toEqual([kavya.userId]);
    expect((await search({ q: kavya.userId })).body.data).toHaveLength(1);
    expect((await search({ q: '100%_' })).body.data).toHaveLength(0);
    expect((await search({ status: 'suspended' })).body.data).toHaveLength(0);
    expect((await search({ status: 'nonsense' })).status).toBe(400);
  });

  it('paginates with an opaque cursor', async () => {
    for (const name of ['Asha', 'Bina', 'Chirag']) await memberWithProfile(name);
    const { accessToken } = await loginAdmin(app, ip, 'super_admin');
    const page = (query: Record<string, string>) =>
      request(app).get('/api/v1/admin/users').query(query).set(bearer(accessToken));

    const first = await page({ limit: '2' });
    expect(first.body.data).toHaveLength(2);
    expect(first.body.meta.nextCursor).toEqual(expect.any(String));

    const second = await page({ limit: '2', cursor: first.body.meta.nextCursor as string });
    expect(second.body.data).toHaveLength(1);
    expect(second.body.meta.nextCursor).toBeNull();
    expect(second.body.data[0].name).toBe('Asha'); // newest first

    expect((await page({ cursor: 'garbage' })).status).toBe(400);
  });

  it('shows user details including private profile fields, but no phone number', async () => {
    const member = await memberWithProfile('Kavya', true);
    const { accessToken } = await loginAdmin(app, ip, 'moderator');

    const res = await request(app)
      .get(`/api/v1/admin/users/${member.userId}`)
      .set(bearer(accessToken));

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      id: member.userId,
      accountStatus: 'active',
      profileStatus: 'complete',
      activeSessionCount: 1,
      profile: { name: 'Kavya', instagramId: 'private.handle' },
      preferences: { discoveryEnabled: false },
      verifications: [],
    });
    expect(JSON.stringify(res.body)).not.toContain(member.phone);
    expect(
      (
        await request(app)
          .get(`/api/v1/admin/users/${crypto.randomUUID()}`)
          .set(bearer(accessToken))
      ).status,
    ).toBe(404);
  });

  it('suspends a user: sessions end immediately and the action is audited', async () => {
    const member = await memberWithProfile('Kavya', true);
    const moderator = await loginAdmin(app, ip, 'moderator');
    const suspend = (reason: string) =>
      request(app)
        .post(`/api/v1/admin/users/${member.userId}/suspend`)
        .set(bearer(moderator.accessToken))
        .send({ reason });

    expect((await suspend('no')).status).toBe(400); // reason too short

    const res = await suspend('Harassment reported by two members');
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ accountStatus: 'suspended', activeSessionCount: 0 });

    // The member's existing token no longer works.
    const me = await request(app).get('/api/v1/auth/me').set(bearer(member.accessToken));
    expect(me.status).toBe(401);
    expect(await UserSession.count({ where: { revokedReason: 'sanction' } })).toBe(1);

    const audit = await AdminAuditLog.findOne({ where: { action: 'user.suspend' } });
    expect(audit).toMatchObject({
      adminId: moderator.adminId,
      targetType: 'user',
      targetId: member.userId,
      metadata: { reason: 'Harassment reported by two members', from: 'active', to: 'suspended' },
    });

    // Suspending twice is a conflict.
    expect((await suspend('Second attempt at suspending')).status).toBe(409);
  });

  it('reactivates a suspended user and audits it', async () => {
    const member = await memberWithProfile('Kavya');
    const moderator = await loginAdmin(app, ip, 'moderator');
    const post = (action: string) =>
      request(app)
        .post(`/api/v1/admin/users/${member.userId}/${action}`)
        .set(bearer(moderator.accessToken))
        .send({ reason: 'Reviewed and resolved with the member' });

    expect((await post('reactivate')).status).toBe(409); // not suspended
    await post('suspend').expect(200);

    const res = await post('reactivate');
    expect(res.status).toBe(200);
    expect(res.body.data.accountStatus).toBe('active');
    expect(await AdminAuditLog.count({ where: { action: 'user.reactivate' } })).toBe(1);
  });

  it('only admins with users:sanction can suspend', async () => {
    const member = await memberWithProfile('Kavya');
    const eventManager = await loginAdmin(app, ip, 'event_manager');

    const res = await request(app)
      .post(`/api/v1/admin/users/${member.userId}/suspend`)
      .set(bearer(eventManager.accessToken))
      .send({ reason: 'Not my permission to do this' });

    expect(res.status).toBe(403);
  });

  it('keeps the audit log append-only', async () => {
    const member = await memberWithProfile('Kavya');
    const moderator = await loginAdmin(app, ip, 'moderator');
    await request(app)
      .post(`/api/v1/admin/users/${member.userId}/suspend`)
      .set(bearer(moderator.accessToken))
      .send({ reason: 'Testing the audit trail' })
      .expect(200);

    await expect(db().query(`UPDATE admin_audit_logs SET action = 'user.hidden'`)).rejects.toThrow(
      /append-only/,
    );
    await expect(db().query('DELETE FROM admin_audit_logs')).rejects.toThrow(/append-only/);
  });
});
