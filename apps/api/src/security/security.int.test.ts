import { randomUUID } from 'node:crypto';
import type { Express } from 'express';
import { SignJWT } from 'jose';
import sharp from 'sharp';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { CSRF_HEADER, CSRF_HEADER_VALUE, LIMITS, type AdminRole } from '@garba-partner/shared';
import { createLogger, redactUrl } from '../lib/logger.js';
import { User, UserPreference, UserSession } from '../models/index.js';
import { TOKEN_AUDIENCES } from '../modules/auth/token.service.js';
import { bearer } from '../test/event-fixtures.js';
import {
  createTestApp,
  createTestEnv,
  hasTestDatabase,
  loginAdmin,
  loginMember,
  newTestPhone,
  uniqueIp,
  useTestDatabase,
} from '../test/helpers.js';
import { createMatchedPair, createMember, type TestMember } from '../test/member-fixtures.js';

const ID = '00000000-0000-4000-8000-000000000001';
const env = createTestEnv();
const memberKey = new TextEncoder().encode(env.JWT_ACCESS_SECRET);

type Method = 'get' | 'post' | 'put' | 'patch' | 'delete';

/** Every member-only endpoint (one per route). */
const MEMBER_ENDPOINTS: [Method, string][] = [
  ['get', '/auth/me'],
  ['post', '/auth/logout'],
  ['get', '/me/profile'],
  ['post', '/me/profile'],
  ['patch', '/me/profile'],
  ['get', '/me/profile/preview'],
  ['delete', '/me/profile/image'],
  ['put', '/me/preferences'],
  ['get', '/me/attendance'],
  ['get', `/events/${ID}/attendance`],
  ['put', `/events/${ID}/attendance`],
  ['delete', `/events/${ID}/attendance`],
  ['get', '/partners'],
  ['get', `/partners/${ID}`],
  ['get', `/users/${ID}/profile`],
  ['post', '/interests'],
  ['get', '/interests/received'],
  ['get', '/interests/sent'],
  ['post', `/interests/${ID}/accept`],
  ['post', `/interests/${ID}/reject`],
  ['get', '/matches'],
  ['get', `/matches/${ID}`],
  ['post', `/matches/${ID}/unmatch`],
  ['get', '/chats'],
  ['get', '/chats/unread'],
  ['get', `/chats/${ID}`],
  ['get', `/chats/${ID}/messages`],
  ['post', `/chats/${ID}/messages`],
  ['post', `/chats/${ID}/read`],
  ['get', '/blocks'],
  ['post', '/blocks'],
  ['delete', `/blocks/${ID}`],
  ['post', '/reports'],
  ['get', '/me/safety'],
  ['post', `/me/warnings/${ID}/acknowledge`],
  ['get', '/notifications'],
  ['get', '/notifications/unread-count'],
  ['post', '/notifications/read-all'],
  ['post', `/notifications/${ID}/read`],
  ['get', '/notifications/preferences'],
  ['put', '/notifications/preferences'],
  ['post', '/orders'],
  ['get', `/orders/${ID}`],
  ['post', `/orders/${ID}/verify`],
  ['get', '/bookings'],
  ['get', `/bookings/${ID}`],
];

/** Every admin router, with the permission that guards it. */
const ADMIN_ENDPOINTS: [Method, string][] = [
  ['get', '/admin/auth/me'],
  ['get', '/admin/users'],
  ['get', `/admin/users/${ID}`],
  ['post', `/admin/users/${ID}/suspend`],
  ['post', `/admin/users/${ID}/ban`],
  ['post', `/admin/users/${ID}/unban`],
  ['get', `/admin/users/${ID}/matches`],
  ['post', `/admin/matches/${ID}/close`],
  ['get', '/admin/reports'],
  ['post', `/admin/reports/${ID}/resolve`],
  ['get', '/admin/events'],
  ['post', '/admin/events'],
  ['put', `/admin/events/${ID}/pass`],
  ['get', '/admin/organizers'],
  ['get', '/admin/safety-logs'],
  ['get', '/admin/audit-logs'],
  ['get', '/admin/notifications/stats'],
  ['get', '/admin/payments/orders'],
  ['get', '/admin/payments/bookings'],
  ['post', `/admin/payments/bookings/${ID}/refund`],
  ['get', '/admin/dashboard/summary'],
];

describe.skipIf(!hasTestDatabase)('security (integration)', () => {
  const db = useTestDatabase();
  let app: Express;
  let ip: string;

  beforeEach(() => {
    app = createTestApp({ sequelize: db() });
    ip = uniqueIp();
  });

  const call = (method: Method, path: string) => request(app)[method](`/api/v1${path}`);

  describe('unauthorized access', () => {
    it('refuses every member endpoint without a valid member token', async () => {
      const admin = await loginAdmin(app, ip, 'super_admin');
      for (const [method, path] of MEMBER_ENDPOINTS) {
        expect((await call(method, path)).status, `${method} ${path}`).toBe(401);
        const garbage = await call(method, path).set('Authorization', 'Bearer not.a.jwt');
        expect(garbage.status, `${method} ${path} garbage`).toBe(401);
        // An admin token is never a member token (different secret and audience).
        const cross = await call(method, path).set(bearer(admin.accessToken));
        expect(cross.status, `${method} ${path} admin token`).toBe(401);
      }
    });

    it('refuses every admin endpoint without a valid admin token', async () => {
      const member = await loginMember(app, ip);
      for (const [method, path] of ADMIN_ENDPOINTS) {
        expect((await call(method, path)).status, `${method} ${path}`).toBe(401);
        const cross = await call(method, path).set(bearer(member.accessToken));
        expect(cross.status, `${method} ${path} member token`).toBe(401);
      }
    });
  });

  describe('invalid JWTs and expired sessions', () => {
    async function forge(
      claims: Record<string, unknown>,
      options: { alg?: string; key?: Uint8Array; exp?: number; aud?: string } = {},
    ) {
      const jwt = new SignJWT(claims)
        .setProtectedHeader({ alg: options.alg ?? 'HS256', typ: 'JWT' })
        .setIssuer('garba-partner')
        .setAudience(options.aud ?? TOKEN_AUDIENCES.member)
        .setIssuedAt()
        .setExpirationTime(options.exp ?? Math.floor(Date.now() / 1000) + 600);
      return jwt.sign(options.key ?? memberKey);
    }

    it('rejects forged, tampered, expired and unsigned tokens', async () => {
      const member = await loginMember(app, ip);
      const session = await UserSession.findOne({ where: { userId: member.userId } });
      const claims = { sub: member.userId, sid: session?.id };
      const me = (token: string) => call('get', '/auth/me').set(bearer(token));

      // Control: a correctly signed token for a live session works.
      expect((await me(await forge(claims))).status).toBe(200);

      const wrongKey = await forge(claims, { key: new TextEncoder().encode('x'.repeat(48)) });
      const expired = await forge(claims, { exp: Math.floor(Date.now() / 1000) - 10 });
      const wrongAudience = await forge(claims, { aud: TOKEN_AUDIENCES.admin });
      const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
      const payload = Buffer.from(
        JSON.stringify({
          ...claims,
          iss: 'garba-partner',
          aud: TOKEN_AUDIENCES.member,
          exp: Math.floor(Date.now() / 1000) + 600,
        }),
      ).toString('base64url');
      const unsigned = `${header}.${payload}.`;
      const [h, , s] = member.accessToken.split('.');
      const otherUser = await createMember(app);
      const tampered = `${h ?? ''}.${Buffer.from(
        JSON.stringify({ sub: otherUser.userId, sid: session?.id, aud: TOKEN_AUDIENCES.member }),
      ).toString('base64url')}.${s ?? ''}`;
      // Valid signature, but a session that belongs to someone else.
      const otherSession = await UserSession.findOne({ where: { userId: otherUser.userId } });
      const mixed = await forge({ sub: member.userId, sid: otherSession?.id });

      for (const [label, token] of Object.entries({
        wrongKey,
        expired,
        wrongAudience,
        unsigned,
        tampered,
        mixed,
      })) {
        expect((await me(token)).status, label).toBe(401);
      }
    });

    it('ends access immediately on logout, session expiry and suspension', async () => {
      const a = await loginMember(app, ip);
      await call('post', '/auth/logout').set(bearer(a.accessToken)).expect(200);
      expect((await call('get', '/auth/me').set(bearer(a.accessToken))).status).toBe(401);

      const b = await loginMember(app, ip);
      await db().query(
        `UPDATE user_sessions SET created_at = now() - interval '2 days',
                                  expires_at = now() - interval '1 second'
          WHERE user_id = :userId`,
        { replacements: { userId: b.userId } },
      );
      expect((await call('get', '/auth/me').set(bearer(b.accessToken))).status).toBe(401);

      const c = await createMember(app);
      await User.update({ status: 'banned' }, { where: { id: c.userId } });
      const banned = await call('get', '/auth/me').set(bearer(c.accessToken));
      expect(banned.status).toBe(403);
      expect(banned.body.error.code).toBe('ACCOUNT_BANNED');
    });
  });

  describe('privilege escalation', () => {
    /** Expected status per role for representative admin actions (validation → 400 is "allowed"). */
    const MATRIX: { path: string; method: Method; allowed: AdminRole[] }[] = [
      { method: 'get', path: '/admin/users', allowed: ['super_admin', 'moderator'] },
      { method: 'post', path: `/admin/users/${ID}/ban`, allowed: ['super_admin', 'moderator'] },
      { method: 'post', path: `/admin/users/${ID}/unban`, allowed: ['super_admin'] },
      { method: 'get', path: '/admin/reports', allowed: ['super_admin', 'moderator'] },
      { method: 'post', path: '/admin/events', allowed: ['super_admin', 'event_manager'] },
      {
        method: 'get',
        path: '/admin/events',
        allowed: ['super_admin', 'moderator', 'event_manager'],
      },
      { method: 'get', path: '/admin/audit-logs', allowed: ['super_admin'] },
      { method: 'get', path: '/admin/safety-logs', allowed: ['super_admin', 'moderator'] },
      {
        method: 'get',
        path: '/admin/payments/bookings',
        allowed: ['super_admin', 'event_manager'],
      },
      { method: 'post', path: `/admin/payments/bookings/${ID}/refund`, allowed: ['super_admin'] },
      {
        method: 'get',
        path: '/admin/dashboard/summary',
        allowed: ['super_admin', 'moderator', 'event_manager'],
      },
    ];

    it('enforces the role/permission matrix on the server', async () => {
      for (const role of ['super_admin', 'moderator', 'event_manager'] as const) {
        const { accessToken } = await loginAdmin(app, ip, role);
        for (const { method, path, allowed } of MATRIX) {
          const res = await call(method, path).set(bearer(accessToken)).send({});
          if (allowed.includes(role)) {
            expect(res.status, `${role} ${method} ${path}`).not.toBe(403);
            expect(res.status, `${role} ${method} ${path}`).not.toBe(401);
          } else {
            expect(res.status, `${role} ${method} ${path}`).toBe(403);
          }
        }
      }
    });

    it('never lets members set server-controlled fields (mass assignment)', async () => {
      const member = await createMember(app);
      for (const body of [
        { status: 'active' },
        { photoVerifiedAt: new Date().toISOString() },
        { role: 'super_admin' },
        { userId: ID },
      ]) {
        const res = await call('patch', '/me/profile').set(bearer(member.accessToken)).send(body);
        expect(res.status, JSON.stringify(body)).toBe(400);
      }
      const prefs = await call('put', '/me/preferences')
        .set(bearer(member.accessToken))
        .send({ hiddenFromDiscovery: false });
      expect(prefs.status).toBe(400);
    });
  });

  describe('IDOR', () => {
    it('never exposes another member’s resources', async () => {
      const { a, b, matchId } = await createMatchedPair(app);
      const stranger = await createMember(app);
      const as = (m: TestMember, method: Method, path: string) =>
        call(method, path).set(bearer(m.accessToken));

      const message = await as(a, 'post', `/chats/${matchId}/messages`).send({
        clientMessageId: randomUUID(),
        body: 'Private hello',
      });
      expect(message.status).toBe(201);
      const notification = (await as(b, 'get', '/notifications')).body.data[0] as { id: string };

      const denied: [Method, string, object?][] = [
        ['get', `/matches/${matchId}`],
        ['post', `/matches/${matchId}/unmatch`],
        ['get', `/chats/${matchId}`],
        ['get', `/chats/${matchId}/messages`],
        ['post', `/chats/${matchId}/messages`, { clientMessageId: randomUUID(), body: 'Hi' }],
        ['post', `/chats/${matchId}/read`, { lastReadMessageId: message.body.data.id as string }],
        ['post', `/notifications/${notification.id}/read`],
      ];
      for (const [method, path, body] of denied) {
        const res = await as(stranger, method, path).send(body ?? {});
        expect(res.status, `${method} ${path}`).toBe(404);
      }
      // Reporting a message from someone else's conversation.
      const report = await as(stranger, 'post', '/reports').send({
        reportedUserId: a.userId,
        reason: 'spam',
        messageId: message.body.data.id as string,
      });
      expect(report.status).toBe(404);
      // The notification is still unread for its owner.
      expect((await as(b, 'get', '/notifications/unread-count')).body.data.unread).toBeGreaterThan(
        0,
      );
    });
  });

  describe('malicious input', () => {
    it('handles injection strings, prototype pollution and odd shapes without 5xx', async () => {
      const member = await createMember(app);
      const admin = await loginAdmin(app, ip, 'super_admin');
      const injections = [
        "' OR 1=1 --",
        "'; DROP TABLE users; --",
        '1) UNION SELECT phone_encrypted FROM users --',
        '%27%20OR%201%3D1',
        '\\x00\\u0000',
      ];
      for (const value of injections) {
        const q = encodeURIComponent(value);
        const search = await call('get', `/admin/users?q=${q}`).set(bearer(admin.accessToken));
        expect(search.status, value).toBe(200);
        expect(search.body.data).toEqual([]);
        expect((await call('get', `/events?q=${q}`)).status, value).toBeLessThan(500);
        expect((await call('get', `/events/${q}`)).status, value).toBe(400);
        expect(
          (await call('get', `/partners?date=${q}`).set(bearer(member.accessToken))).status,
          value,
        ).toBe(400);
        expect(
          (await call('get', `/admin/events?sort=${q}`).set(bearer(admin.accessToken))).status,
        ).toBe(400);
      }
      expect(await User.count()).toBeGreaterThan(0); // nothing was dropped

      const polluted = await call('patch', '/me/profile')
        .set(bearer(member.accessToken))
        .set('Content-Type', 'application/json')
        .send('{"__proto__":{"isAdmin":true},"bio":"hello"}');
      expect(polluted.status).toBe(400);
      expect(({} as Record<string, unknown>).isAdmin).toBeUndefined();

      // Repeated query keys arrive as arrays; nested objects as objects: validation errors.
      expect((await call('get', '/events?city=a&city=b')).status).toBe(400);
      expect(
        (await call('get', '/notifications?limit[$gt]=1').set(bearer(member.accessToken))).status,
      ).toBe(400);
      // Malformed and oversized JSON.
      const bad = await call('post', '/auth/send-otp')
        .set('Content-Type', 'application/json')
        .send('{"phone":');
      expect(bad.status).toBe(400);
      const huge = await call('post', '/auth/send-otp').send({ phone: 'x'.repeat(200_000) });
      expect(huge.status).toBe(413);
    });

    it('stores XSS payloads as inert text and returns JSON only', async () => {
      const { a, b, matchId } = await createMatchedPair(app);
      const payload = '<script>alert(1)</script><img src=x onerror=alert(1)>';
      const sent = await call('post', `/chats/${matchId}/messages`)
        .set(bearer(a.accessToken))
        .send({ clientMessageId: randomUUID(), body: payload });
      expect(sent.status).toBe(201);
      const history = await call('get', `/chats/${matchId}/messages`).set(bearer(b.accessToken));
      expect(history.headers['content-type']).toMatch(/^application\/json/);
      expect(history.body.data[0].body).toBe(payload); // rendered as text by React, never as HTML
      expect(history.headers['x-content-type-options']).toBe('nosniff');

      const bio = await call('patch', '/me/profile')
        .set(bearer(a.accessToken))
        .send({ bio: 'Hi <b>there</b> javascript:alert(1)' });
      expect(bio.status).toBe(200);
      // Links to javascript: are never accepted where URLs are stored.
      const admin = await loginAdmin(app, ip, 'event_manager');
      const organizer = await call('post', '/admin/organizers')
        .set(bearer(admin.accessToken))
        .send({ name: 'Evil Org', websiteUrl: 'javascript:alert(1)' });
      expect(organizer.status).toBe(400);
      const dataUrl = await call('post', '/admin/organizers')
        .set(bearer(admin.accessToken))
        .send({ name: 'Evil Org', websiteUrl: 'data:text/html,<script>alert(1)</script>' });
      expect(dataUrl.status).toBe(400);
    });
  });

  describe('file upload abuse', () => {
    const upload = (m: TestMember, file: Buffer, name: string, type: string) =>
      call('post', '/me/profile/image')
        .set(bearer(m.accessToken))
        .attach('image', file, { filename: name, contentType: type });

    it('rejects non-images, SVG, oversized, bomb and multi-file uploads', async () => {
      const member = await createMember(app, { photo: false });
      const html = Buffer.from('<html><script>alert(1)</script></html>');
      expect((await upload(member, html, 'x.jpg', 'image/jpeg')).status).toBe(400);
      const svg = Buffer.from(
        '<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"><rect width="500" height="500"/></svg>',
      );
      expect((await upload(member, svg, 'x.svg', 'image/svg+xml')).status).toBe(400);
      expect((await upload(member, svg, 'x.png', 'image/png')).status).toBe(400);
      const php = Buffer.concat([
        await sharp({ create: { width: 500, height: 500, channels: 3, background: '#fff' } })
          .jpeg()
          .toBuffer(),
        Buffer.from('<?php system($_GET["c"]); ?>'),
      ]);
      // A real image with junk appended is re-encoded: the junk never reaches storage.
      const polyglot = await upload(member, php, '../../evil.php', 'image/jpeg');
      expect([200, 400]).toContain(polyglot.status);

      const big = Buffer.alloc(11 * 1024 * 1024, 1);
      expect((await upload(member, big, 'big.jpg', 'image/jpeg')).status).toBe(413);

      // Decompression bomb: tiny file, enormous dimensions.
      const bomb = await sharp({
        create: { width: 20_000, height: 20_000, channels: 3, background: '#000' },
        limitInputPixels: false,
      })
        .png({ compressionLevel: 9 })
        .toBuffer();
      const bombRes = await upload(member, bomb, 'bomb.png', 'image/png');
      expect(bombRes.status).toBe(400);

      const two = await call('post', '/me/profile/image')
        .set(bearer(member.accessToken))
        .attach('image', html, 'a.jpg')
        .attach('image', html, 'b.jpg');
      expect(two.status).toBe(400);
      const wrongField = await call('post', '/me/profile/image')
        .set(bearer(member.accessToken))
        .attach('avatar', html, 'a.jpg');
      expect(wrongField.status).toBe(400);
    });
  });

  describe('CSRF', () => {
    it('protects the cookie-authenticated refresh endpoints', async () => {
      const phone = newTestPhone();
      const sent = await call('post', '/auth/send-otp').set('X-Forwarded-For', ip).send({ phone });
      const verified = await call('post', '/auth/verify-otp')
        .set('X-Forwarded-For', ip)
        .send({ phone, code: sent.body.data.devOtp as string });
      const cookie = verified.headers['set-cookie'] as unknown as string[];
      expect(cookie.join(';')).toMatch(/HttpOnly/i);
      expect(cookie.join(';')).toMatch(/SameSite=Strict/i);

      const refresh = () =>
        call('post', '/auth/refresh').set('X-Forwarded-For', ip).set('Cookie', cookie);
      expect((await refresh()).status).toBe(403); // no CSRF header
      expect((await refresh().set(CSRF_HEADER, CSRF_HEADER_VALUE.admin)).status).toBe(403);
      expect(
        (
          await refresh()
            .set(CSRF_HEADER, CSRF_HEADER_VALUE.web)
            .set('Origin', 'https://evil.example')
        ).status,
      ).toBe(403);
      expect((await refresh().set(CSRF_HEADER, CSRF_HEADER_VALUE.web)).status).toBe(200);

      // CORS never grants a foreign origin credentials.
      const preflight = await request(app)
        .options('/api/v1/auth/refresh')
        .set('Origin', 'https://evil.example')
        .set('Access-Control-Request-Method', 'POST');
      expect(preflight.headers['access-control-allow-origin']).toBeUndefined();
    });
  });

  describe('rate-limit bypass', () => {
    it('limits OTPs per phone number even from rotating IP addresses', async () => {
      const phone = newTestPhone();
      const statuses: number[] = [];
      for (let i = 0; i < 7; i += 1) {
        statuses.push(
          (await call('post', '/auth/send-otp').set('X-Forwarded-For', uniqueIp()).send({ phone }))
            .status,
        );
      }
      expect(statuses).toContain(429);
      // Formatting variations are the same number.
      const variant = await call('post', '/auth/send-otp')
        .set('X-Forwarded-For', uniqueIp())
        .send({ phone: `+91 ${phone.slice(0, 5)} ${phone.slice(5)}` });
      expect(variant.status).toBe(429);
    });

    it('limits OTP guessing per code, whatever the IP address', async () => {
      const phone = newTestPhone();
      const sent = await call('post', '/auth/send-otp').set('X-Forwarded-For', ip).send({ phone });
      const real = sent.body.data.devOtp as string;
      const wrong = real === '111111' ? '222222' : '111111';
      const codes: string[] = [];
      for (let i = 0; i < 6; i += 1) {
        const res = await call('post', '/auth/verify-otp')
          .set('X-Forwarded-For', uniqueIp())
          .send({ phone, code: wrong });
        codes.push(res.body.error.code as string);
      }
      expect(codes).toContain('OTP_ATTEMPTS_EXCEEDED');
      // The code is burnt: even the right code no longer works.
      const late = await call('post', '/auth/verify-otp')
        .set('X-Forwarded-For', uniqueIp())
        .send({ phone, code: real });
      expect(late.status).toBe(400);
    });
  });

  describe('regressions for QA findings', () => {
    it('SEC-01: public profiles follow discovery visibility (paused, hidden, reported)', async () => {
      const viewer = await createMember(app);
      const target = await createMember(app, { gender: 'woman' });
      const view = () =>
        call('get', `/users/${target.userId}/profile`).set(bearer(viewer.accessToken));
      expect((await view()).status).toBe(200);

      await UserPreference.update(
        { discoveryEnabled: false },
        { where: { userId: target.userId } },
      );
      expect((await view()).status).toBe(404);
      await UserPreference.update({ discoveryEnabled: true }, { where: { userId: target.userId } });

      await User.update(
        { hiddenFromDiscovery: true, hiddenReason: 'p0_report' },
        { where: { id: target.userId } },
      );
      expect((await view()).status).toBe(404);
      await User.update(
        { hiddenFromDiscovery: false, hiddenReason: null },
        { where: { id: target.userId } },
      );
      expect((await view()).status).toBe(200);

      await call('post', '/reports')
        .set(bearer(viewer.accessToken))
        .send({ reportedUserId: target.userId, reason: 'spam', alsoBlock: false })
        .expect(201);
      expect((await view()).status).toBe(404);
      // The reported member can't look up the reporter either.
      expect(
        (await call('get', `/users/${viewer.userId}/profile`).set(bearer(target.accessToken)))
          .status,
      ).toBe(404);

      // Matched members still see each other even if one pauses discovery.
      const { a, b } = await createMatchedPair(app);
      await UserPreference.update({ discoveryEnabled: false }, { where: { userId: b.userId } });
      expect(
        (await call('get', `/users/${b.userId}/profile`).set(bearer(a.accessToken))).status,
      ).toBe(200);
    });

    it('SEC-02: phone numbers in admin searches never reach the request logs', async () => {
      const lines: string[] = [];
      const logger = createLogger(
        { LOG_LEVEL: 'info', NODE_ENV: 'test' },
        { write: (line: string) => lines.push(line) },
      );
      const logged = createTestApp({ sequelize: db(), logger });
      const admin = await loginAdmin(logged, ip, 'moderator');
      const phone = '9876543210';
      await request(logged)
        .get(`/api/v1/admin/users?q=${phone}&limit=5`)
        .set(bearer(admin.accessToken))
        .expect(200);
      const output = lines.join('\n');
      expect(output).toContain('/api/v1/admin/users?q=');
      expect(output).not.toContain(phone);
      expect(output).not.toContain(admin.accessToken);
      expect(redactUrl('/x?q=98765&limit=5')).toBe('/x?q=%5BREDACTED%5D&limit=5');
      expect(redactUrl('/x?limit=5')).toBe('/x?limit=5');
    });

    it('never logs SQL values or secrets from error objects', async () => {
      const lines: string[] = [];
      const logger = createLogger(
        { LOG_LEVEL: 'info', NODE_ENV: 'test' },
        { write: (line: string) => lines.push(line) },
      );
      const err = await db()
        .query('SELECT no_such_column FROM users WHERE phone_hash = :q', {
          replacements: { q: '9876543210' },
        })
        .catch((error: unknown) => error);
      logger.error({ err }, 'Unhandled error');
      logger.info({ body: { secret: 'JBSWY3DP' } }, 'x');
      const output = lines.join('\n');
      expect(output).toContain('Unhandled error');
      expect(output).not.toContain('9876543210');
      expect(output).not.toContain('JBSWY3DP');
    });
  });

  describe('error hygiene and headers', () => {
    it('never leaks stack traces or internals, and sets security headers', async () => {
      const notFound = await call('get', '/definitely-not-a-route');
      expect(notFound.status).toBe(404);
      expect(notFound.body).toMatchObject({ success: false, error: { code: 'NOT_FOUND' } });
      const res = await call('get', '/events?limit=abc');
      expect(res.status).toBe(400);
      expect(JSON.stringify(res.body)).not.toMatch(/at \w+ \(|node_modules|Sequelize|SELECT /);
      expect(res.headers['x-powered-by']).toBeUndefined();
      expect(res.headers['x-content-type-options']).toBe('nosniff');
      expect(res.headers['strict-transport-security']).toBeDefined();
      expect(res.headers['x-frame-options']).toBeDefined();
      expect(res.headers['referrer-policy']).toBe('no-referrer');
      expect(res.headers['strict-transport-security']).toMatch(/max-age=31536000/);
    });
  });

  describe('security hardening', () => {
    it('never lets browsers or proxies cache personal responses', async () => {
      const member = await loginMember(app, ip);
      const admin = await loginAdmin(app, ip, 'moderator');
      const privateResponses = [
        await call('get', '/auth/me').set(bearer(member.accessToken)),
        await call('get', '/me/profile').set(bearer(member.accessToken)),
        await call('get', '/notifications').set(bearer(member.accessToken)),
        await call('post', '/auth/send-otp').set('X-Forwarded-For', ip).send({ phone: 'bad' }),
        await call('get', '/admin/auth/me').set(bearer(admin.accessToken)),
        await call('get', '/admin/users').set(bearer(admin.accessToken)),
      ];
      privateResponses.forEach((res, i) => {
        expect(res.headers['cache-control'], String(i)).toMatch(/\bno-store\b/);
      });
      // Public, non-personal lists keep their short public cache.
      expect((await call('get', '/events')).headers['cache-control']).toBe('public, max-age=60');
    });

    it('allows only our origins, methods and headers in CORS', async () => {
      const preflight = (origin: string, method = 'POST', headers = 'content-type') =>
        request(app)
          .options('/api/v1/auth/send-otp')
          .set('Origin', origin)
          .set('Access-Control-Request-Method', method)
          .set('Access-Control-Request-Headers', headers);
      for (const origin of [env.WEB_ORIGIN, env.ADMIN_ORIGIN]) {
        const res = await preflight(origin);
        expect(res.headers['access-control-allow-origin']).toBe(origin);
        expect(res.headers['access-control-allow-credentials']).toBe('true');
      }
      const allowed = await preflight(env.WEB_ORIGIN, 'PROPFIND', 'x-evil, content-type');
      expect(allowed.headers['access-control-allow-methods']).toBe('GET,POST,PUT,PATCH,DELETE');
      expect(allowed.headers['access-control-allow-headers']).not.toMatch(/x-evil/i);
      expect(
        (await preflight('https://evil.example')).headers['access-control-allow-origin'],
      ).toBeUndefined();
      // Look-alike origins are not prefixes of ours.
      expect(
        (await preflight(`${env.WEB_ORIGIN}.evil.example`)).headers['access-control-allow-origin'],
      ).toBeUndefined();
    });

    it('applies a global per-IP request limit (webhooks exempt)', async () => {
      const statuses: number[] = [];
      for (let i = 0; i <= LIMITS.API_REQUESTS_PER_MINUTE; i += 1) {
        statuses.push((await call('get', '/health').set('X-Forwarded-For', ip)).status);
      }
      expect(statuses.slice(0, LIMITS.API_REQUESTS_PER_MINUTE).every((s) => s !== 429)).toBe(true);
      const limited = await call('get', '/events').set('X-Forwarded-For', ip);
      expect(limited.status).toBe(429);
      expect(limited.body).toMatchObject({ success: false, error: { code: 'RATE_LIMITED' } });
      expect(limited.headers['retry-after']).toBeDefined();
      // Razorpay's retries must still reach the (signature-verified) webhook.
      const webhook = await call('post', '/webhooks/razorpay').set('X-Forwarded-For', ip).send({});
      expect(webhook.status).not.toBe(429);
      // Other clients are unaffected.
      expect((await call('get', '/health').set('X-Forwarded-For', uniqueIp())).status).not.toBe(
        429,
      );
    });
  });
});
