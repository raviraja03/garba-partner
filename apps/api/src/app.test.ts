import { pino } from 'pino';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { loadServerEnv } from '@garba-partner/config/server';
import { createApp } from './app.js';

const env = loadServerEnv({ source: { NODE_ENV: 'test' } });
const app = createApp({ env, logger: pino({ level: 'silent' }) });

describe('GET /api/v1/health', () => {
  it('returns the success envelope with status ok', async () => {
    const res = await request(app).get('/api/v1/health');

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ success: true, message: 'OK', data: { status: 'ok' } });
    expect(res.body).toHaveProperty('data.timestamp', expect.any(String));
    expect(res.headers['cache-control']).toBe('no-store');
  });

  it('generates a request id, and reuses a well-formed incoming one', async () => {
    const generated = await request(app).get('/api/v1/health');
    expect(generated.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);

    const echoed = await request(app).get('/api/v1/health').set('X-Request-Id', 'abc12345-test');
    expect(echoed.headers['x-request-id']).toBe('abc12345-test');

    const rejected = await request(app).get('/api/v1/health').set('X-Request-Id', 'bad id!');
    expect(rejected.headers['x-request-id']).not.toBe('bad id!');
  });

  it('sets security headers and hides the framework', async () => {
    const res = await request(app).get('/api/v1/health');

    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-powered-by']).toBeUndefined();
  });
});

describe('error handling', () => {
  it('returns the NOT_FOUND envelope for unknown routes', async () => {
    const res = await request(app).get('/api/v1/does-not-exist');

    expect(res.status).toBe(404);
    expect(res.body).toEqual({
      success: false,
      message: 'The requested resource was not found.',
      error: { code: 'NOT_FOUND', details: null },
    });
  });

  it('returns VALIDATION_ERROR for malformed JSON without leaking parser details', async () => {
    const res = await request(app)
      .post('/api/v1/health')
      .set('Content-Type', 'application/json')
      .send('{"broken":');

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error.code', 'VALIDATION_ERROR');
    expect(JSON.stringify(res.body)).not.toMatch(/stack|SyntaxError/);
  });
});
