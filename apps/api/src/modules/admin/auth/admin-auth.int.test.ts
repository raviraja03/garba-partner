import type { Express } from 'express';
import request, { type Response } from 'supertest';
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
import { totpCode, totpStep } from '../../../lib/totp.js';
import {
  AdminAuditLog,
  AdminLoginChallenge,
  AdminSession,
  AdminUser,
} from '../../../models/index.js';
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

  const post = (path: string, body: object) =>
    request(app).post(`/api/v1/admin/auth${path}`).set('X-Forwarded-For', ip).send(body);
  const loginRequest = (email: string, password: string) => post('/login', { email, password });
  const setup = (challengeToken: string) => post('/login/totp-setup', { challengeToken });
  const verify = (challengeToken: string, code: string) =>
    post('/login/verify', { challengeToken, code });

  const adminMe = (token: string) =>
    request(app).get('/api/v1/admin/auth/me').set('Authorization', `Bearer ${token}`);

  const adminRefresh = (cookie: string | undefined) => {
    const req = request(app)
      .post('/api/v1/admin/auth/refresh')
      .set('X-Forwarded-For', ip)
      .set(CSRF_HEADER, CSRF_HEADER_VALUE.admin);
    return cookie ? req.set('Cookie', cookie) : req;
  };

  /** First sign-in: password → setup → code. Returns the session response and the secret. */
  async function enrol(email: string): Promise<{ res: Response; secret: string }> {
    const login = await loginRequest(email, PASSWORD);
    expect(login.status).toBe(200);
    expect(login.body.data.method).toBe('setup');
    const token = login.body.data.challengeToken as string;
    const secret = (await setup(token)).body.data.secret as string;
    const res = await verify(token, totpCode(secret, totpStep()));
    return { res, secret };
  }

  /** Later sign-ins: password → code (for `step`, default the next one to avoid replay). */
  async function signIn(email: string, secret: string, step = totpStep() + 1) {
    const login = await loginRequest(email, PASSWORD);
    expect(login.body.data.method).toBe('totp');
    return verify(login.body.data.challengeToken as string, totpCode(secret, step));
  }

  describe('two-factor sign-in', () => {
    it('never grants a session for the password alone', async () => {
      const admin = await createAdmin();
      const res = await loginRequest(admin.email.toUpperCase(), PASSWORD);
      expect(res.status).toBe(200);
      expect(Object.keys(res.body.data).sort()).toEqual(['challengeToken', 'expiresAt', 'method']);
      expect(res.body.data.challengeToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
      expect(getSetCookieLine(res, ADMIN_REFRESH_COOKIE)).toBeUndefined();
      expect(res.headers['cache-control']).toBe('no-store');
      expect(await AdminSession.count()).toBe(0);
      // Only a hash of the challenge is stored.
      const stored = await AdminLoginChallenge.findOne();
      expect(stored?.tokenHash).not.toBe(res.body.data.challengeToken);
    });

    it('enrols an authenticator on first sign-in and issues the session', async () => {
      const admin = await createAdmin({ role: 'event_manager' });
      const login = await loginRequest(admin.email, PASSWORD);
      const token = login.body.data.challengeToken as string;
      const first = await setup(token);
      expect(first.status).toBe(200);
      expect(first.body.data.secret).toMatch(/^[A-Z2-7]{32}$/);
      expect(first.body.data.otpauthUri).toContain('otpauth://totp/');
      // Reloading the setup page shows the same secret.
      expect((await setup(token)).body.data.secret).toBe(first.body.data.secret);

      const secret = first.body.data.secret as string;
      expect((await verify(token, '000000')).body.error.code).toBe('MFA_CODE_INVALID');
      const res = await verify(token, totpCode(secret, totpStep()));
      expect(res.status).toBe(200);
      expect(res.body.data.admin).toEqual({
        id: admin.id,
        email: admin.email,
        name: 'Test Admin',
        role: 'event_manager',
        permissions: [...ROLE_PERMISSIONS.event_manager],
      });
      const serialized = JSON.stringify(res.body);
      expect(serialized).not.toContain('argon2');
      expect(serialized).not.toContain(secret);
      const cookieLine = getSetCookieLine(res, ADMIN_REFRESH_COOKIE) ?? '';
      expect(cookieLine).toMatch(/HttpOnly/i);
      expect(cookieLine).toMatch(/SameSite=Strict/i);
      expect(cookieLine).toMatch(/Path=\/api\/v1\/admin\/auth/);

      // The secret is stored encrypted, never in plain text.
      const stored = await AdminUser.scope('withSecrets').findByPk(admin.id);
      expect(stored?.totpEnabledAt).not.toBeNull();
      expect(stored?.totpSecretEncrypted).not.toContain(secret);
      // The challenge can't be used again.
      expect((await verify(token, totpCode(secret, totpStep() + 1))).body.error.code).toBe(
        'MFA_CHALLENGE_INVALID',
      );
      const actions = (await AdminAuditLog.findAll({ where: { adminId: admin.id } })).map(
        (log) => log.action,
      );
      expect(actions.sort()).toEqual(['admin.login', 'admin.totp_enrolled']);
      expect((await adminMe(res.body.data.accessToken as string)).body.data.role).toBe(
        'event_manager',
      );
    });

    it('asks enrolled admins for a code and refuses replays', async () => {
      const admin = await createAdmin();
      const { secret } = await enrol(admin.email);

      const login = await loginRequest(admin.email, PASSWORD);
      expect(login.body.data.method).toBe('totp');
      const token = login.body.data.challengeToken as string;
      // No re-enrolment through a normal sign-in.
      expect((await setup(token)).body.error.code).toBe('MFA_CHALLENGE_INVALID');
      // The code already used at enrolment (same 30-second step) is refused.
      expect((await verify(token, totpCode(secret, totpStep()))).body.error.code).toBe(
        'MFA_CODE_INVALID',
      );
      const ok = await verify(token, totpCode(secret, totpStep() + 1));
      expect(ok.status).toBe(200);
    });

    it('expires challenges and limits attempts per challenge', async () => {
      const admin = await createAdmin();
      const { secret } = await enrol(admin.email);
      const expired = await loginRequest(admin.email, PASSWORD);
      await db().query(
        `UPDATE admin_login_challenges SET expires_at = now() - interval '1 second'`,
      );
      expect(
        (await verify(expired.body.data.challengeToken as string, totpCode(secret, totpStep() + 1)))
          .body.error.code,
      ).toBe('MFA_CHALLENGE_INVALID');
      expect((await verify('x'.repeat(43), '123456')).body.error.code).toBe(
        'MFA_CHALLENGE_INVALID',
      );
      expect((await verify('short', '123456')).status).toBe(400);
    });

    it('counts wrong codes toward the account lockout (audited)', async () => {
      const admin = await createAdmin();
      await enrol(admin.email);
      const login = await loginRequest(admin.email, PASSWORD);
      const token = login.body.data.challengeToken as string;
      const codes: string[] = [];
      for (let i = 0; i < LIMITS.ADMIN_MAX_FAILED_LOGINS; i += 1) {
        codes.push((await verify(token, '000000')).body.error.code as string);
      }
      expect(codes.slice(0, -1).every((c) => c === 'MFA_CODE_INVALID')).toBe(true);
      expect(codes.at(-1)).toBe('ACCOUNT_LOCKED');
      // Locked: even the right password and code don't work.
      const again = await loginRequest(admin.email, PASSWORD);
      expect(again.status).toBe(423);
      expect(await AdminAuditLog.count({ where: { action: 'admin.lockout' } })).toBe(1);
    });

    it('treats the password step the same: wrong passwords lock the account', async () => {
      const admin = await createAdmin();
      for (let attempt = 1; attempt < LIMITS.ADMIN_MAX_FAILED_LOGINS; attempt += 1) {
        expect((await loginRequest(admin.email, 'wrong-password')).status).toBe(401);
      }
      const locking = await loginRequest(admin.email, 'wrong-password');
      expect(locking.status).toBe(423);
      expect(locking.body.error.code).toBe('ACCOUNT_LOCKED');
      expect(Number(locking.headers['retry-after'])).toBeGreaterThan(0);
      expect((await loginRequest(admin.email, PASSWORD)).status).toBe(423);
      expect(await AdminSession.count()).toBe(0);
    });
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

  it('keeps member and admin tokens separate', async () => {
    const admin = await createAdmin();
    const { res } = await enrol(admin.email);
    const adminToken = res.body.data.accessToken as string;
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

  it('logout revokes the admin session and is audited', async () => {
    const admin = await createAdmin();
    const { res: login } = await enrol(admin.email);
    const token = login.body.data.accessToken as string;

    const res = await request(app)
      .post('/api/v1/admin/auth/logout')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect((await adminMe(token)).status).toBe(401);
    expect((await adminRefresh(getCookie(login, ADMIN_REFRESH_COOKIE))).status).toBe(401);
    expect(await AdminAuditLog.count({ where: { action: 'admin.logout' } })).toBe(1);
  });

  it('refresh rotates the token, and idle sessions expire', async () => {
    const admin = await createAdmin();
    const { secret } = await enrol(admin.email);
    const login = await signIn(admin.email, secret);

    const refreshed = await adminRefresh(getCookie(login, ADMIN_REFRESH_COOKIE));
    expect(refreshed.status).toBe(200);
    const rotated = getCookie(refreshed, ADMIN_REFRESH_COOKIE);

    await db().query(`UPDATE admin_sessions SET last_used_at = now() - interval '2 hours'`);
    const idle = await adminRefresh(rotated);
    expect(idle.status).toBe(401);
    expect(await AdminSession.findOne({ where: { revokedReason: 'idle_timeout' } })).not.toBeNull();
  });

  it('disabling an admin blocks existing access tokens immediately', async () => {
    const admin = await createAdmin();
    const token = (await enrol(admin.email)).res.body.data.accessToken as string;

    await admin.update({ status: 'disabled' });

    expect((await adminMe(token)).status).toBe(401);
  });
});
