import type { Express } from 'express';
import request from 'supertest';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  CSRF_HEADER,
  CSRF_HEADER_VALUE,
  LIMITS,
  MEMBER_REFRESH_COOKIE,
} from '@garba-partner/shared';
import { encryptString, hashPhone } from '../../lib/crypto.js';
import { User, UserSession } from '../../models/index.js';
import { createFirebaseTestIssuer, type IdTokenOptions } from '../../test/firebase-tokens.js';
import {
  createTestApp,
  createTestEnv,
  getCookie,
  getSetCookieLine,
  hasTestDatabase,
  uniqueIp,
  useTestDatabase,
} from '../../test/helpers.js';
import { createTokenService } from './token.service.js';

const env = createTestEnv();
let phoneCounter = 0;

/** A fresh, obviously fake Indian mobile number per call. */
function newPhone(): string {
  phoneCounter += 1;
  return `99999${String(phoneCounter).padStart(5, '0')}`;
}

describe.skipIf(!hasTestDatabase)('member authentication (integration)', () => {
  const db = useTestDatabase();
  let app: Express;
  let ip: string;
  /** Issues ID tokens the way Firebase does; the app runs the REAL verifier against its keys. */
  let firebase: Awaited<ReturnType<typeof createFirebaseTestIssuer>>;

  beforeAll(async () => {
    firebase = await createFirebaseTestIssuer();
    app = createTestApp({ sequelize: db(), env, phoneTokens: firebase.verifier() });
  });
  beforeEach(() => {
    ip = uniqueIp();
  });

  /** What the browser does after Firebase confirms the SMS code: post the ID token, nothing else. */
  const phoneLogin = (idToken: unknown, extra: Record<string, unknown> = {}) =>
    request(app)
      .post('/api/v1/auth/phone')
      .set('X-Forwarded-For', ip)
      .send({ idToken, ...extra });
  const tokenFor = (phone: string, options: IdTokenOptions = {}) =>
    firebase.idToken({ phone: `+91${phone}`, ...options });

  const refresh = (cookie: string | undefined) => {
    const req = request(app)
      .post('/api/v1/auth/refresh')
      .set('X-Forwarded-For', ip)
      .set(CSRF_HEADER, CSRF_HEADER_VALUE.web);
    return cookie ? req.set('Cookie', cookie) : req;
  };

  const me = (accessToken: string) =>
    request(app).get('/api/v1/auth/me').set('Authorization', `Bearer ${accessToken}`);

  /** Full login; returns the access token and refresh cookie. */
  async function login(phone = newPhone()) {
    const res = await phoneLogin(await tokenFor(phone));
    expect(res.status).toBe(200);
    const cookie = getCookie(res, MEMBER_REFRESH_COOKIE);
    expect(cookie).toBeDefined();
    return {
      phone,
      accessToken: res.body.data.accessToken as string,
      userId: res.body.data.user.id as string,
      cookie: cookie ?? '',
    };
  }

  const expectRefused = async (idToken: string, message?: string) => {
    const res = await phoneLogin(idToken);
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('PHONE_VERIFICATION_FAILED');
    expect(res.body.message).toBe(
      message ?? 'We could not verify your phone number. Please request a new code.',
    );
    expect(getCookie(res, MEMBER_REFRESH_COOKIE)).toBeUndefined();
    expect(await User.count()).toBe(0);
    expect(await UserSession.count()).toBe(0);
  };

  describe('POST /auth/phone', () => {
    it('valid token: signs a new member up, creates the session, sets a secure refresh cookie', async () => {
      const phone = newPhone();

      const res = await phoneLogin(await tokenFor(phone));

      expect(res.status).toBe(200);
      expect(res.body.data.accessToken).toEqual(expect.any(String));
      expect(res.body.data.user).toMatchObject({
        status: 'active',
        onboardingStatus: 'incomplete',
        photoVerified: false,
      });
      expect(JSON.stringify(res.body)).not.toContain(phone);

      const cookieLine = getSetCookieLine(res, MEMBER_REFRESH_COOKIE) ?? '';
      expect(cookieLine).toMatch(/HttpOnly/i);
      expect(cookieLine).toMatch(/SameSite=Strict/i);
      expect(cookieLine).toMatch(/Path=\/api\/v1\/auth/);

      expect(await User.count()).toBe(1);
      expect(await UserSession.count()).toBe(1);
      const user = await User.scope('withPhone').findOne();
      // Stored exactly as before: a hash to look the number up, and the number encrypted.
      expect(user?.phoneHash).toBe(hashPhone(`+91${phone}`, env.PHONE_HASH_SECRET));
      expect(user?.phoneEncrypted).not.toContain(phone);
      const session = await UserSession.findOne();
      const cookieValue = getCookie(res, MEMBER_REFRESH_COOKIE)?.split('=')[1] ?? '';
      expect(session?.refreshTokenHash).not.toBe(cookieValue); // only a hash is stored
    });

    it('a member who signed up before the switch to Firebase keeps the same account', async () => {
      // An account as the old OTP flow created it: phone hash + encrypted number, no Firebase ID.
      const phone = newPhone();
      const existing = await User.create({
        phoneHash: hashPhone(`+91${phone}`, env.PHONE_HASH_SECRET),
        phoneEncrypted: encryptString(`+91${phone}`, env.PHONE_ENCRYPTION_KEY),
        phoneKeyVersion: 1,
      });

      const res = await phoneLogin(await tokenFor(phone, { uid: 'a-brand-new-firebase-uid' }));

      expect(res.status).toBe(200);
      expect(res.body.data.user.id).toBe(existing.id);
      expect(await User.count()).toBe(1);
    });

    it('logs the same number into the same account every time, whatever the Firebase user ID', async () => {
      const first = await login();
      const again = await phoneLogin(await tokenFor(first.phone, { uid: 'another-firebase-uid' }));
      expect(again.body.data.user.id).toBe(first.userId);
      expect(await User.count()).toBe(1);
    });

    it('five simultaneous first sign-ins for one number create one account', async () => {
      const phone = newPhone();
      const tokens = await Promise.all([1, 2, 3, 4, 5].map(() => tokenFor(phone)));
      const results = await Promise.all(tokens.map((token) => phoneLogin(token)));
      expect(results.map((res) => res.status)).toEqual([200, 200, 200, 200, 200]);
      expect(new Set(results.map((res) => res.body.data.user.id as string)).size).toBe(1);
      expect(await User.count()).toBe(1);
    });

    it('refuses a forged token (valid claims, wrong signing key)', async () => {
      await expectRefused(await firebase.forgedIdToken({ phone: `+91${newPhone()}` }));
    });

    it('refuses an expired token', async () => {
      await expectRefused(await tokenFor(newPhone(), { expiresInSeconds: -30 }));
    });

    it('refuses a token from another Firebase project', async () => {
      await expectRefused(await tokenFor(newPhone(), { projectId: 'someone-elses-project' }));
    });

    it('refuses a token without a verified phone number, or not from a phone sign-in', async () => {
      await expectRefused(await firebase.idToken({ phone: null }));
      await expectRefused(await tokenFor(newPhone(), { provider: 'password' }));
    });

    it('refuses a genuine token that is replayed after the allowed window', async () => {
      await expectRefused(
        await tokenFor(newPhone(), { verifiedSecondsAgo: LIMITS.PHONE_TOKEN_MAX_AGE_SECONDS + 5 }),
      );
    });

    it('refuses numbers outside India with a clear message', async () => {
      await expectRefused(
        await firebase.idToken({ phone: '+14155550123' }),
        'Only Indian mobile numbers are supported.',
      );
    });

    it('takes identity from the token only: a phone, user ID or role in the body is rejected', async () => {
      const victim = await login();
      const attacker = newPhone();
      const token = await tokenFor(attacker);

      for (const extra of [
        { phone: `+91${victim.phone}` },
        { phoneNumber: `+91${victim.phone}` },
        { uid: victim.userId },
        { userId: victim.userId },
        { role: 'super_admin' },
        { isAdmin: true },
        { phoneVerified: true },
      ]) {
        const res = await phoneLogin(token, extra);
        expect(res.status).toBe(400);
        expect(res.body.error.code).toBe('VALIDATION_ERROR');
      }
      // Without the extras the same token signs in as the attacker's own number, never the victim's.
      const own = await phoneLogin(token);
      expect(own.status).toBe(200);
      expect(own.body.data.user.id).not.toBe(victim.userId);
      expect(JSON.stringify(own.body.data.user)).not.toMatch(/role|admin/i);
    });

    it('rejects a missing or malformed token with VALIDATION_ERROR, and nonsense with 401', async () => {
      for (const body of [undefined, null, 12345, '', 'short', 'x'.repeat(5000)]) {
        const res = await phoneLogin(body);
        expect(res.status).toBe(400);
        expect(res.body.error.code).toBe('VALIDATION_ERROR');
      }
      await expectRefused('x'.repeat(300));
    });

    it('banned accounts cannot log in and get no session', async () => {
      const phone = newPhone();
      await User.create({
        phoneHash: hashPhone(`+91${phone}`, env.PHONE_HASH_SECRET),
        phoneEncrypted: encryptString(`+91${phone}`, env.PHONE_ENCRYPTION_KEY),
        phoneKeyVersion: 1,
        status: 'banned',
      });

      const res = await phoneLogin(await tokenFor(phone));

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('ACCOUNT_BANNED');
      expect(await UserSession.count()).toBe(0);
    });

    it('answers 503 when Google’s keys cannot be fetched, and signs nobody in', async () => {
      const offline = createTestApp({
        sequelize: db(),
        env,
        phoneTokens: firebase.verifier({
          keys: () => Promise.reject(new TypeError('fetch failed')),
        }),
      });
      const res = await request(offline)
        .post('/api/v1/auth/phone')
        .set('X-Forwarded-For', ip)
        .send({ idToken: await tokenFor(newPhone()) });
      expect(res.status).toBe(503);
      expect(res.body.message).toBe('We could not verify your number right now. Please try again.');
      expect(await UserSession.count()).toBe(0);
    });

    it('limits how often one address can exchange tokens', async () => {
      const limited = createTestApp({ sequelize: db(), env, phoneTokens: firebase.verifier() });
      const attempt = () =>
        request(limited)
          .post('/api/v1/auth/phone')
          .set('X-Forwarded-For', ip)
          .send({ idToken: 'x'.repeat(300) });
      for (let i = 0; i < LIMITS.PHONE_LOGINS_PER_IP_PER_15_MIN; i += 1) {
        expect((await attempt()).status).toBe(401);
      }
      const blocked = await attempt();
      expect(blocked.status).toBe(429);
      expect(blocked.headers['retry-after']).toBeDefined();
    });

    it('the old code endpoints are gone', async () => {
      const phone = newPhone();
      for (const path of ['/api/v1/auth/send-otp', '/api/v1/auth/verify-otp']) {
        const res = await request(app)
          .post(path)
          .set('X-Forwarded-For', ip)
          .send({ phone, code: '123456' });
        expect(res.status).toBe(404);
      }
      expect(await User.count()).toBe(0);
    });
  });

  describe('unauthorized access', () => {
    it('rejects /auth/me without a token', async () => {
      const res = await request(app).get('/api/v1/auth/me');

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('UNAUTHENTICATED');
    });

    it('rejects malformed tokens, foreign-secret tokens and admin tokens', async () => {
      const { userId } = await login();
      const session = await UserSession.findOne();
      const claims = { subjectId: userId, sessionId: session?.id ?? '' };

      const wrongSecret = createTokenService(
        createTestEnv({ JWT_ACCESS_SECRET: 'another-member-secret-000000000000000000000' }),
      );
      const forged = await wrongSecret.sign('member', claims);
      const adminAudience = await createTokenService(env).sign('admin', claims);

      for (const token of ['not-a-jwt', forged.token, adminAudience.token]) {
        const res = await me(token);
        expect(res.status).toBe(401);
        expect(res.body.error.code).toBe('UNAUTHENTICATED');
      }
    });

    it('returns the member profile summary with a valid token', async () => {
      const { accessToken, userId } = await login();

      const res = await me(accessToken);

      expect(res.status).toBe(200);
      expect(res.body.data).toEqual({
        id: userId,
        status: 'active',
        onboardingStatus: 'incomplete',
        photoVerified: false,
        displayName: null,
      });
    });
  });

  describe('POST /auth/logout', () => {
    it('revokes the session: the access token and refresh cookie stop working', async () => {
      const { accessToken, cookie } = await login();

      const res = await request(app)
        .post('/api/v1/auth/logout')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({});

      expect(res.status).toBe(200);
      expect(getSetCookieLine(res, MEMBER_REFRESH_COOKIE)).toMatch(/Expires=Thu, 01 Jan 1970/);
      expect((await me(accessToken)).status).toBe(401);
      expect((await refresh(cookie)).status).toBe(401);
      expect((await UserSession.findOne())?.revokedReason).toBe('logout');
    });

    it('allDevices revokes every session of the account', async () => {
      const first = await login();
      const second = await login(first.phone);

      await request(app)
        .post('/api/v1/auth/logout')
        .set('Authorization', `Bearer ${second.accessToken}`)
        .send({ allDevices: true })
        .expect(200);

      expect((await me(first.accessToken)).status).toBe(401);
      expect(await UserSession.count({ where: { revokedReason: 'logout_all' } })).toBe(2);
    });

    it('requires authentication', async () => {
      expect((await request(app).post('/api/v1/auth/logout').send({})).status).toBe(401);
    });
  });

  describe('POST /auth/refresh', () => {
    it('rotates the refresh token and issues a new access token', async () => {
      const { cookie } = await login();

      const res = await refresh(cookie);

      expect(res.status).toBe(200);
      expect(res.body.data.accessToken).toEqual(expect.any(String));
      const rotated = getCookie(res, MEMBER_REFRESH_COOKIE);
      expect(rotated).toBeDefined();
      expect(rotated).not.toBe(cookie);
      expect((await me(res.body.data.accessToken as string)).status).toBe(200);
      expect((await refresh(rotated)).status).toBe(200);
    });

    it('records member activity at most once an hour (dashboard "active users")', async () => {
      const { cookie } = await login();
      const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
      await User.update({ lastActiveAt: twoHoursAgo }, { where: {} });
      const rotated = getCookie(await refresh(cookie), MEMBER_REFRESH_COOKIE);
      const after = (await User.findOne())?.lastActiveAt?.getTime() ?? 0;
      expect(after).toBeGreaterThan(Date.now() - 60 * 1000);

      // Within the hour, refreshes don't write again.
      const recent = new Date(Date.now() - 10 * 60 * 1000);
      await User.update({ lastActiveAt: recent }, { where: {} });
      await refresh(rotated).expect(200);
      expect((await User.findOne())?.lastActiveAt?.getTime()).toBe(recent.getTime());
    });

    it('detects reuse of a rotated-out token and revokes the session', async () => {
      const { cookie } = await login();
      const rotated = getCookie(await refresh(cookie), MEMBER_REFRESH_COOKIE);
      // Move the rotation outside the multi-tab grace window.
      await db().query(`UPDATE user_sessions SET rotated_at = now() - interval '1 minute'`);

      const reuse = await refresh(cookie);

      expect(reuse.status).toBe(401);
      expect(reuse.body.error.code).toBe('REFRESH_INVALID');
      expect((await UserSession.findOne())?.revokedReason).toBe('reuse_detected');
      expect((await refresh(rotated)).status).toBe(401);
    });

    it('does not revoke the session for a concurrent refresh inside the grace window', async () => {
      const { cookie } = await login();
      const rotated = getCookie(await refresh(cookie), MEMBER_REFRESH_COOKIE);

      expect((await refresh(cookie)).status).toBe(401);
      expect((await refresh(rotated)).status).toBe(200);
    });

    it('requires the CSRF header and rejects foreign origins', async () => {
      const { cookie } = await login();

      const noHeader = await request(app)
        .post('/api/v1/auth/refresh')
        .set('X-Forwarded-For', ip)
        .set('Cookie', cookie);
      expect(noHeader.status).toBe(403);

      const foreignOrigin = await refresh(cookie).set('Origin', 'https://evil.example');
      expect(foreignOrigin.status).toBe(403);
    });

    it('fails without a cookie or with an unknown token', async () => {
      expect((await refresh(undefined)).body.error.code).toBe('REFRESH_INVALID');
      expect((await refresh(`${MEMBER_REFRESH_COOKIE}=unknown-token`)).status).toBe(401);
    });

    it('fails for an expired session', async () => {
      const { cookie } = await login();
      await db().query(
        `UPDATE user_sessions SET created_at = now() - interval '31 days', expires_at = now() - interval '1 day'`,
      );

      expect((await refresh(cookie)).status).toBe(401);
    });
  });
});
