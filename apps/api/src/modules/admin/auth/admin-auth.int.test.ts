import type { Express } from 'express';
import request from 'supertest';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  ADMIN_REFRESH_COOKIE,
  CSRF_HEADER,
  CSRF_HEADER_VALUE,
  LIMITS,
  ROLE_PERMISSIONS,
  type AdminRole,
} from '@garba-partner/shared';
import { hashPassword } from '../../../lib/passwords.js';
import { AdminSession, AdminUser } from '../../../models/index.js';
import {
  createTestApp,
  createTestEnv,
  getCookie,
  getSetCookieLine,
  hasTestDatabase,
  uniqueIp,
  useTestDatabase,
} from '../../../test/helpers.js';
import { createTokenService } from '../../auth/token.service.js';

const PASSWORD = 'correct-horse-battery-staple';
const env = createTestEnv();

describe.skipIf(!hasTestDatabase)('admin authentication (integration)', () => {
  const db = useTestDatabase();
  let app: Express;
  let ip: string;
  let passwordHash: string;

  beforeAll(async () => {
    app = createTestApp({ sequelize: db(), env });
    passwordHash = await hashPassword(PASSWORD);
  });
  beforeEach(() => {
    ip = uniqueIp();
  });

  async function createAdmin(overrides: { role?: AdminRole; status?: 'active' | 'disabled' } = {}) {
    return AdminUser.create({
      email: `admin${String(Date.now())}${String(Math.random()).slice(2, 6)}@garbapartner.test`,
      name: 'Test Admin',
      role: overrides.role ?? 'moderator',
      status: overrides.status ?? 'active',
      passwordHash,
    });
  }

  const loginRequest = (email: string, password: string) =>
    request(app)
      .post('/api/v1/admin/auth/login')
      .set('X-Forwarded-For', ip)
      .send({ email, password });

  const adminMe = (token: string) =>
    request(app).get('/api/v1/admin/auth/me').set('Authorization', `Bearer ${token}`);

  const adminRefresh = (cookie: string | undefined) => {
    const req = request(app)
      .post('/api/v1/admin/auth/refresh')
      .set('X-Forwarded-For', ip)
      .set(CSRF_HEADER, CSRF_HEADER_VALUE.admin);
    return cookie ? req.set('Cookie', cookie) : req;
  };

  it('logs in with valid credentials and returns role permissions', async () => {
    const admin = await createAdmin({ role: 'event_manager' });

    const res = await loginRequest(admin.email.toUpperCase(), PASSWORD);

    expect(res.status).toBe(200);
    expect(res.body.data.admin).toEqual({
      id: admin.id,
      email: admin.email,
      name: 'Test Admin',
      role: 'event_manager',
      permissions: [...ROLE_PERMISSIONS.event_manager],
    });
    expect(JSON.stringify(res.body)).not.toContain('argon2');
    const cookieLine = getSetCookieLine(res, ADMIN_REFRESH_COOKIE) ?? '';
    expect(cookieLine).toMatch(/HttpOnly/i);
    expect(cookieLine).toMatch(/Path=\/api\/v1\/admin\/auth/);

    const meRes = await adminMe(res.body.data.accessToken as string);
    expect(meRes.status).toBe(200);
    expect(meRes.body.data.role).toBe('event_manager');
  });

  it('gives the same 401 for a wrong password, an unknown email and a disabled admin', async () => {
    const admin = await createAdmin();
    const disabled = await createAdmin({ status: 'disabled' });

    const responses = [
      await loginRequest(admin.email, 'wrong-password'),
      await loginRequest('nobody@garbapartner.test', PASSWORD),
      await loginRequest(disabled.email, PASSWORD),
    ];

    for (const res of responses) {
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('INVALID_CREDENTIALS');
      expect(res.body.message).toBe(responses[0]?.body.message);
    }
  });

  it('locks the account after too many failed attempts', async () => {
    const admin = await createAdmin();

    for (let attempt = 1; attempt < LIMITS.ADMIN_MAX_FAILED_LOGINS; attempt += 1) {
      expect((await loginRequest(admin.email, 'wrong-password')).status).toBe(401);
    }
    const locking = await loginRequest(admin.email, 'wrong-password');
    expect(locking.status).toBe(423);
    expect(locking.body.error.code).toBe('ACCOUNT_LOCKED');
    expect(Number(locking.headers['retry-after'])).toBeGreaterThan(0);

    // Even the correct password is refused while locked.
    const correct = await loginRequest(admin.email, PASSWORD);
    expect(correct.status).toBe(423);
    expect(await AdminSession.count()).toBe(0);
  });

  it('keeps member and admin tokens separate', async () => {
    const admin = await createAdmin();
    const login = await loginRequest(admin.email, PASSWORD);
    const adminToken = login.body.data.accessToken as string;
    const session = await AdminSession.findOne();
    const memberAudienceToken = await createTokenService(env).sign('member', {
      subjectId: admin.id,
      sessionId: session?.id ?? '',
    });

    expect((await adminMe(memberAudienceToken.token)).status).toBe(401);
    const memberMe = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(memberMe.status).toBe(401);
  });

  it('rejects unauthenticated access to protected admin routes', async () => {
    expect((await request(app).get('/api/v1/admin/auth/me')).status).toBe(401);
    expect((await request(app).post('/api/v1/admin/auth/logout')).status).toBe(401);
  });

  it('logout revokes the admin session', async () => {
    const admin = await createAdmin();
    const login = await loginRequest(admin.email, PASSWORD);
    const token = login.body.data.accessToken as string;

    const res = await request(app)
      .post('/api/v1/admin/auth/logout')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect((await adminMe(token)).status).toBe(401);
    expect((await adminRefresh(getCookie(login, ADMIN_REFRESH_COOKIE))).status).toBe(401);
  });

  it('refresh rotates the token, and idle sessions expire', async () => {
    const admin = await createAdmin();
    const login = await loginRequest(admin.email, PASSWORD);

    const refreshed = await adminRefresh(getCookie(login, ADMIN_REFRESH_COOKIE));
    expect(refreshed.status).toBe(200);
    const rotated = getCookie(refreshed, ADMIN_REFRESH_COOKIE);

    await db().query(`UPDATE admin_sessions SET last_used_at = now() - interval '2 hours'`);
    const idle = await adminRefresh(rotated);
    expect(idle.status).toBe(401);
    expect((await AdminSession.findOne())?.revokedReason).toBe('idle_timeout');
  });

  it('disabling an admin blocks existing access tokens immediately', async () => {
    const admin = await createAdmin();
    const token = (await loginRequest(admin.email, PASSWORD)).body.data.accessToken as string;

    await admin.update({ status: 'disabled' });

    expect((await adminMe(token)).status).toBe(401);
  });
});
