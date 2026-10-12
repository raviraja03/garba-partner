import { Writable } from 'node:stream';
import type { Express } from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createLogger } from '../lib/logger.js';
import { ApiLog, City } from '../models/index.js';
import {
  createApiLogStore,
  purgeOldApiLogs,
  type ApiLogStore,
} from '../modules/api-logs/api-log.store.js';
import type { PhoneTokenVerifier } from '../providers/firebase/index.js';
import { createFirebaseTestIssuer } from '../test/firebase-tokens.js';
import {
  createTestApp,
  createTestEnv,
  fakePhoneToken,
  hasTestDatabase,
  loginAdmin,
  loginMember,
  newTestPhone,
  uniqueIp,
  useTestDatabase,
} from '../test/helpers.js';

interface LogLine {
  level: number;
  msg: string;
  requestId?: string;
  userId?: string | null;
  adminId?: string | null;
  result?: string;
  durationMs?: number;
}

/** A logger that keeps its output in memory, so tests can read exactly what was written. */
function memoryLogger(level = 'info') {
  let text = '';
  const stream = new Writable({
    write(chunk: Buffer, _encoding, done) {
      text += chunk.toString('utf8');
      done();
    },
  });
  const logger = createLogger({ LOG_LEVEL: level as 'info', NODE_ENV: 'test' }, stream);
  return {
    logger,
    text: () => text,
    lines: () =>
      text
        .split('\n')
        .filter(Boolean)
        .map((line) => JSON.parse(line) as LogLine),
  };
}

describe.skipIf(!hasTestDatabase)('central API logging (integration)', () => {
  const db = useTestDatabase();
  let log: ReturnType<typeof memoryLogger>;
  let store: ApiLogStore;
  let app: Express;
  let ip: string;

  const build = (overrides: Record<string, string> = {}, phoneTokens?: PhoneTokenVerifier) =>
    createTestApp({
      sequelize: db(),
      env: createTestEnv({ ...overrides }),
      logger: log.logger,
      apiLogs: store,
      ...(phoneTokens ? { phoneTokens } : {}),
    });

  beforeEach(async () => {
    await db().query('TRUNCATE api_logs');
    log = memoryLogger();
    store = createApiLogStore({ logger: log.logger, flushIntervalMs: 60_000 });
    app = build();
    ip = uniqueIp();
  });

  const apiLines = () => log.lines().filter((line) => line.msg.startsWith('[API'));
  const rows = async () => {
    await store.flush();
    return ApiLog.findAll({ order: [['requestTimestamp', 'ASC']] });
  };

  it('logs a successful GET to the server log and to api_logs', async () => {
    const res = await request(app).get('/api/v1/cities').set('X-Forwarded-For', ip).expect(200);
    const requestId = String(res.headers['x-request-id']);

    const [line] = apiLines();
    expect(line?.msg).toMatch(
      new RegExp(
        `^\\[API\\] GET /api/v1/cities \\| 200 \\| \\d+ms \\| requestId=${requestId} \\| userId=-$`,
      ),
    );
    expect(line).toMatchObject({ level: 30, requestId, userId: null, result: 'SUCCESS' });

    const [row] = await rows();
    expect(row).toMatchObject({
      requestId,
      userId: null,
      adminId: null,
      method: 'GET',
      endpoint: '/api/v1/cities',
      statusCode: 200,
      success: true,
      errorCode: null,
      errorMessage: null,
      ipAddress: ip,
    });
    expect(row?.responseTimeMs).toBeGreaterThanOrEqual(0);
    expect(row?.responseTimestamp.getTime()).toBeGreaterThanOrEqual(
      row?.requestTimestamp.getTime() ?? Infinity,
    );
  });

  it('logs a successful sign-in without the phone number or the token', async () => {
    const phone = newTestPhone();
    const idToken = fakePhoneToken(phone);
    const res = await request(app)
      .post('/api/v1/auth/phone')
      .set('X-Forwarded-For', ip)
      .set('User-Agent', 'api-logging-test')
      .send({ idToken })
      .expect(200);
    const { accessToken } = (res.body as { data: { accessToken: string } }).data;

    expect(apiLines()[0]?.msg).toMatch(/^\[API\] POST \/api\/v1\/auth\/phone \| 200 \|/);
    const [row] = await rows();
    expect(row).toMatchObject({ method: 'POST', statusCode: 200, userAgent: 'api-logging-test' });

    // Nothing sensitive in the log text or in the stored row: no number, no Firebase token,
    // no application token.
    const stored = JSON.stringify(row?.toJSON());
    for (const secret of [phone, idToken, accessToken]) {
      expect(log.text()).not.toContain(secret);
      expect(stored).not.toContain(secret);
    }
  });

  it('logs a 400 validation error with the public message', async () => {
    await request(app)
      .post('/api/v1/auth/phone')
      .set('X-Forwarded-For', ip)
      .send({ idToken: 'not-a-token' })
      .expect(400);

    const [line] = apiLines();
    expect(line?.level).toBe(40);
    expect(line?.msg).toMatch(
      /^\[API ERROR\] POST \/api\/v1\/auth\/phone \| 400 \| \d+ms \|.*\| error=.+/,
    );
    expect(line?.result).toBe('FAILURE');
    const [row] = await rows();
    expect(row).toMatchObject({ statusCode: 400, success: false, errorCode: 'VALIDATION_ERROR' });
    expect(row?.errorMessage).toBeTruthy();
  });

  it('logs a 401 for a protected route called without a session', async () => {
    await request(app).get('/api/v1/auth/me').set('X-Forwarded-For', ip).expect(401);
    expect(apiLines()[0]?.msg).toMatch(
      /^\[API ERROR\] GET \/api\/v1\/auth\/me \| 401 \|.*userId=- \| error=/,
    );
    const [row] = await rows();
    expect(row).toMatchObject({
      statusCode: 401,
      success: false,
      errorCode: 'UNAUTHENTICATED',
      userId: null,
    });
  });

  it('logs a 404 for an unknown endpoint, without its query string', async () => {
    await request(app)
      .get('/api/v1/no/such/endpoint?phone=9876543210&token=secret-value')
      .set('X-Forwarded-For', ip)
      .expect(404);
    const [row] = await rows();
    expect(row).toMatchObject({
      endpoint: '/api/v1/no/such/endpoint',
      statusCode: 404,
      errorCode: 'NOT_FOUND',
    });
    expect(apiLines()[0]?.msg).toContain('GET /api/v1/no/such/endpoint | 404');
    expect(log.text()).not.toContain('9876543210');
    expect(log.text()).not.toContain('secret-value');
  });

  it('logs a 500 with the real cause (digits masked), while the client gets a generic message', async () => {
    const spy = vi
      .spyOn(City, 'findAll')
      .mockRejectedValueOnce(new Error('Database connection failed for 9876543210'));
    const res = await request(app).get('/api/v1/cities').set('X-Forwarded-For', ip).expect(500);
    spy.mockRestore();

    expect(JSON.stringify(res.body)).not.toContain('Database connection failed');
    const line = apiLines()[0];
    expect(line?.level).toBe(50);
    expect(line?.msg).toMatch(
      /^\[API ERROR\] GET \/api\/v1\/cities \| 500 \| \d+ms \| requestId=\S+ \| userId=- \| error=Error: Database connection failed for \[digits\]$/,
    );
    const [row] = await rows();
    expect(row).toMatchObject({
      statusCode: 500,
      success: false,
      errorCode: 'INTERNAL_ERROR',
      errorMessage: 'Error: Database connection failed for [digits]',
    });
  });

  it('records the member on an authenticated request and nobody on a public one', async () => {
    const member = await loginMember(app, ip);
    await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${member.accessToken}`)
      .expect(200);
    await request(app).get('/api/v1/cities').expect(200);

    const all = await rows();
    const me = all.find((row) => row.endpoint === '/api/v1/auth/me');
    expect(me).toMatchObject({ userId: member.userId, adminId: null, statusCode: 200 });
    expect(all.find((row) => row.endpoint === '/api/v1/cities')?.userId).toBeNull();
    expect(apiLines().some((line) => line.msg.endsWith(`userId=${member.userId}`))).toBe(true);
    expect(apiLines().find((line) => line.msg.includes('/auth/me'))?.userId).toBe(member.userId);

    // Tokens never reach the log or the table.
    expect(log.text()).not.toContain(member.accessToken);
    expect(JSON.stringify(all.map((row) => row.toJSON()))).not.toContain(member.accessToken);
  });

  it('records the admin on an admin request', async () => {
    const admin = await loginAdmin(app, ip, 'super_admin');
    await request(app)
      .get('/api/v1/admin/auth/me')
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .expect(200);
    const row = (await rows()).find((r) => r.endpoint === '/api/v1/admin/auth/me');
    expect(row).toMatchObject({ adminId: admin.adminId, userId: null });
    expect(apiLines().some((line) => line.msg.endsWith(`userId=admin:${admin.adminId}`))).toBe(
      true,
    );
    // The admin's password went through the login request body: never logged.
    expect(log.text()).not.toContain('test-admin-password');
  });

  it('skips health checks and CORS preflights', async () => {
    await request(app).get('/api/v1/health').expect(200);
    await request(app)
      .options('/api/v1/cities')
      .set('Origin', 'http://localhost:5173')
      .set('Access-Control-Request-Method', 'GET');
    expect(apiLines()).toHaveLength(0);
    expect(await rows()).toHaveLength(0);
  });

  it('LOG_API_REQUESTS=false silences the log lines but keeps the request ID and the table', async () => {
    app = build({ LOG_API_REQUESTS: 'false' });
    const res = await request(app).get('/api/v1/cities').expect(200);
    expect(res.headers['x-request-id']).toBeTruthy();
    expect(apiLines()).toHaveLength(0);
    expect(await rows()).toHaveLength(1);
  });

  it('stores nothing when no sink is given (LOG_API_TO_DATABASE=false)', async () => {
    app = createTestApp({ sequelize: db(), logger: log.logger });
    await request(app).get('/api/v1/cities').expect(200);
    expect(apiLines()).toHaveLength(1);
    expect(await rows()).toHaveLength(0);
  });

  it('a failing log write never fails or delays the request', async () => {
    const spy = vi.spyOn(ApiLog, 'bulkCreate').mockRejectedValue(new Error('database is down'));
    await request(app).get('/api/v1/cities').expect(200);
    await store.flush();
    spy.mockRestore();
    expect(log.lines().some((line) => line.msg === 'API log batch could not be stored')).toBe(true);
    // The store keeps working afterwards.
    await request(app).get('/api/v1/cities').expect(200);
    expect(await rows()).toHaveLength(1);
  });

  it('writes in batches and caps the queue when the database cannot keep up', async () => {
    const small = createApiLogStore({
      logger: log.logger,
      flushIntervalMs: 60_000,
      maxBatch: 50,
      maxQueue: 3,
    });
    const entry = (n: number) => ({
      requestId: `request-${String(n)}`,
      userId: null,
      adminId: null,
      method: 'GET',
      endpoint: '/api/v1/cities',
      statusCode: 200,
      responseTimeMs: n,
      ipAddress: null,
      userAgent: null,
      requestTimestamp: new Date(),
      responseTimestamp: new Date(),
      success: true,
      errorCode: null,
      errorMessage: null,
    });
    for (let n = 1; n <= 5; n += 1) small.record(entry(n));
    await small.flush();
    const stored = await ApiLog.findAll({ order: [['responseTimeMs', 'ASC']] });
    expect(stored.map((row) => row.requestId)).toEqual(['request-3', 'request-4', 'request-5']);
    expect(log.lines().some((line) => line.msg.includes('oldest entries were dropped'))).toBe(true);
  });

  it('retention removes only rows older than the limit', async () => {
    await request(app).get('/api/v1/cities').expect(200);
    await store.flush();
    await db()
      .query(`INSERT INTO api_logs (request_id, method, endpoint, status_code, response_time_ms,
        request_timestamp, response_timestamp, success, created_at)
      VALUES ('old-request-1', 'GET', '/api/v1/old', 200, 1, now(), now(), true, now() - interval '31 days')`);
    expect(await purgeOldApiLogs(db(), 30)).toBe(1);
    expect((await ApiLog.findAll()).map((row) => row.endpoint)).toEqual(['/api/v1/cities']);
  });

  describe('phone sign-in logging', () => {
    it('a refused Firebase token is logged by reason only, never the token itself', async () => {
      const firebase = await createFirebaseTestIssuer();
      app = build({}, firebase.verifier());
      const phone = newTestPhone();
      const forged = await firebase.forgedIdToken({ phone: `+91${phone}` });

      await request(app)
        .post('/api/v1/auth/phone')
        .set('X-Forwarded-For', ip)
        .send({ idToken: forged })
        .expect(401);

      expect(log.text()).toContain('"reason":"bad_signature"');
      expect(log.text()).not.toContain(forged);
      // Not even a recognisable part of it (header, claims or signature).
      for (const part of forged.split('.')) expect(log.text()).not.toContain(part);
      expect(log.text()).not.toContain(phone);
      const stored = JSON.stringify((await rows()).map((row) => row.toJSON()));
      expect(stored).not.toContain(forged);
      expect(stored).not.toContain(phone);
      expect(await rows()).toMatchObject([
        { statusCode: 401, success: false, errorCode: 'PHONE_VERIFICATION_FAILED' },
      ]);
    });

    it('a genuine Firebase token is never written to the log either', async () => {
      const firebase = await createFirebaseTestIssuer();
      app = build({}, firebase.verifier());
      const phone = newTestPhone();
      const idToken = await firebase.idToken({ phone: `+91${phone}` });

      await request(app)
        .post('/api/v1/auth/phone')
        .set('X-Forwarded-For', ip)
        .send({ idToken })
        .expect(200);

      for (const part of idToken.split('.')) expect(log.text()).not.toContain(part);
      expect(log.text()).not.toContain(phone);
    });
  });
});
