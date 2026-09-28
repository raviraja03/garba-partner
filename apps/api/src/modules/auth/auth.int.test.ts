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
import { OtpRequest, User, UserSession } from '../../models/index.js';
import type { SmsProvider } from '../../providers/sms/index.js';
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

  beforeAll(() => {
    app = createTestApp({ sequelize: db(), env });
  });
  beforeEach(() => {
    ip = uniqueIp();
  });

  const sendOtp = (phone: string) =>
    request(app).post('/api/v1/auth/send-otp').set('X-Forwarded-For', ip).send({ phone });

  const verifyOtp = (phone: string, code: string) =>
    request(app).post('/api/v1/auth/verify-otp').set('X-Forwarded-For', ip).send({ phone, code });

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
    const sent = await sendOtp(phone);
    expect(sent.status).toBe(200);
    const res = await verifyOtp(phone, sent.body.data.devOtp as string);
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

  /** A syntactically valid code that is NOT the issued one. */
  const wrongCode = (code: string) => String((Number(code) + 1) % 1_000_000).padStart(6, '0');

  describe('POST /auth/send-otp', () => {
    it('stores only an HMAC of the code and returns the dev code in development', async () => {
      const phone = newPhone();
      const res = await sendOtp(phone);

      expect(res.status).toBe(200);
      expect(res.body.data).toMatchObject({
        expiresInSeconds: LIMITS.OTP_TTL_SECONDS,
        resendAvailableInSeconds: LIMITS.OTP_RESEND_COOLDOWN_SECONDS,
      });
      const code = res.body.data.devOtp as string;
      expect(code).toMatch(/^\d{6}$/);

      const rows = await OtpRequest.findAll();
      expect(rows).toHaveLength(1);
      expect(rows[0]?.otpHash).not.toContain(code);
      expect(rows[0]?.phoneHash).toBe(hashPhone(`+91${phone}`, env.PHONE_HASH_SECRET));
      expect(JSON.stringify(rows[0]?.toJSON())).not.toContain(phone);
    });

    it('never returns the code when a real provider delivers it', async () => {
      const delivered: string[] = [];
      const smsProvider: SmsProvider = {
        name: 'recording',
        exposesCodeInResponse: false,
        sendOtp: (_phone, code) => {
          delivered.push(code);
          return Promise.resolve();
        },
      };
      const smsApp = createTestApp({ sequelize: db(), env, sms: smsProvider });

      const res = await request(smsApp)
        .post('/api/v1/auth/send-otp')
        .set('X-Forwarded-For', ip)
        .send({ phone: newPhone() });

      expect(res.status).toBe(200);
      expect(res.body.data).not.toHaveProperty('devOtp');
      expect(delivered).toHaveLength(1);
      expect(JSON.stringify(res.body)).not.toContain(delivered[0]);
    });

    it('rejects the development provider outside APP_ENV=development', () => {
      expect(() => createTestEnv({ APP_ENV: 'staging' })).toThrow(/SMS_PROVIDER/);
    });

    it('rejects an invalid phone number with VALIDATION_ERROR', async () => {
      const res = await sendOtp('12345');

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
      expect(res.body.error.details[0].path).toBe('phone');
    });

    it('enforces the resend cooldown with 429 and Retry-After', async () => {
      const phone = newPhone();
      expect((await sendOtp(phone)).status).toBe(200);

      const res = await sendOtp(phone);

      expect(res.status).toBe(429);
      expect(res.body.error.code).toBe('RATE_LIMITED');
      expect(Number(res.headers['retry-after'])).toBeGreaterThan(0);
    });

    it('gives the same response shape for new and existing numbers', async () => {
      const { phone } = await login();
      await OtpRequest.destroy({ where: {} }); // skip the cooldown for this assertion

      const existing = await sendOtp(phone);
      const fresh = await sendOtp(newPhone());

      expect(existing.status).toBe(fresh.status);
      expect(Object.keys(existing.body.data as object).sort()).toEqual(
        Object.keys(fresh.body.data as object).sort(),
      );
      expect(existing.body.message).toBe(fresh.body.message);
    });
  });

  describe('POST /auth/verify-otp', () => {
    it('valid OTP: logs in, creates the user and session, sets a secure refresh cookie', async () => {
      const phone = newPhone();
      const code = (await sendOtp(phone)).body.data.devOtp as string;

      const res = await verifyOtp(phone, code);

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
      const session = await UserSession.findOne();
      const cookieValue = getCookie(res, MEMBER_REFRESH_COOKIE)?.split('=')[1] ?? '';
      expect(session?.refreshTokenHash).not.toBe(cookieValue); // only a hash is stored
    });

    it('logs an existing number into the same account', async () => {
      const first = await login();
      await OtpRequest.destroy({ where: {} });

      const second = await login(first.phone);

      expect(second.userId).toBe(first.userId);
      expect(await User.count()).toBe(1);
    });

    it('invalid OTP: 400 OTP_INVALID, attempt recorded, remaining attempts reported', async () => {
      const phone = newPhone();
      const code = (await sendOtp(phone)).body.data.devOtp as string;

      const res = await verifyOtp(phone, wrongCode(code));

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('OTP_INVALID');
      expect(res.body.message).toContain(`${String(LIMITS.OTP_MAX_ATTEMPTS - 1)} attempt`);
      expect((await OtpRequest.findOne())?.attempts).toBe(1);
      expect(await UserSession.count()).toBe(0);
    });

    it('expired OTP: 400 OTP_EXPIRED and the code can no longer be used', async () => {
      const phone = newPhone();
      const code = (await sendOtp(phone)).body.data.devOtp as string;
      await db().query(
        `UPDATE otp_requests
            SET created_at = now() - interval '10 minutes', expires_at = now() - interval '1 second'`,
      );

      const res = await verifyOtp(phone, code);

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('OTP_EXPIRED');
      expect((await OtpRequest.findOne())?.invalidatedAt).not.toBeNull();
      expect((await verifyOtp(phone, code)).body.error.code).toBe('OTP_INVALID');
    });

    it('too many attempts: the code is invalidated, even the correct code is then rejected', async () => {
      const phone = newPhone();
      const code = (await sendOtp(phone)).body.data.devOtp as string;

      for (let attempt = 1; attempt < LIMITS.OTP_MAX_ATTEMPTS; attempt += 1) {
        expect((await verifyOtp(phone, wrongCode(code))).body.error.code).toBe('OTP_INVALID');
      }
      const last = await verifyOtp(phone, wrongCode(code));
      expect(last.status).toBe(400);
      expect(last.body.error.code).toBe('OTP_ATTEMPTS_EXCEEDED');

      const withCorrectCode = await verifyOtp(phone, code);
      expect(withCorrectCode.status).toBe(400);
      expect(await UserSession.count()).toBe(0);
    });

    it('a code cannot be used twice', async () => {
      const phone = newPhone();
      const code = (await sendOtp(phone)).body.data.devOtp as string;
      expect((await verifyOtp(phone, code)).status).toBe(200);

      const replay = await verifyOtp(phone, code);

      expect(replay.status).toBe(400);
      expect(await UserSession.count()).toBe(1);
    });

    it('banned accounts cannot log in and get no session', async () => {
      const phone = newPhone();
      await User.create({
        phoneHash: hashPhone(`+91${phone}`, env.PHONE_HASH_SECRET),
        phoneEncrypted: encryptString(`+91${phone}`, env.PHONE_ENCRYPTION_KEY),
        phoneKeyVersion: 1,
        status: 'banned',
      });
      const code = (await sendOtp(phone)).body.data.devOtp as string;

      const res = await verifyOtp(phone, code);

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('ACCOUNT_BANNED');
      expect(await UserSession.count()).toBe(0);
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
      await OtpRequest.destroy({ where: {} });
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
