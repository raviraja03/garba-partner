import express, { type RequestHandler } from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import type { AdminRole, UserStatus } from '@garba-partner/shared';
import { requireActiveMember, requirePermission } from './authorize.js';
import { errorHandler } from './error-handler.js';

/** Builds a tiny app whose "authentication" step injects a fixed identity. */
function appWith(identity: RequestHandler, guard: RequestHandler) {
  const app = express();
  app.use((req, _res, next) => {
    req.log = { error: () => undefined } as unknown as typeof req.log;
    next();
  });
  app.get('/protected', identity, guard, (_req, res) => {
    res.json({ ok: true });
  });
  app.use(errorHandler);
  return app;
}

const asAdmin =
  (role: AdminRole): RequestHandler =>
  (req, _res, next) => {
    req.admin = { adminId: 'a', sessionId: 's', role };
    next();
  };

const asMember =
  (status: UserStatus, onboarded = true): RequestHandler =>
  (req, _res, next) => {
    req.auth = { userId: 'u', sessionId: 's', status, onboarded };
    next();
  };

const anonymous: RequestHandler = (_req, _res, next) => {
  next();
};

describe('requirePermission', () => {
  it.each([
    ['super_admin', 'admins:manage', 200],
    ['moderator', 'reports:manage', 200],
    ['moderator', 'events:manage', 403],
    ['event_manager', 'events:manage', 200],
    ['event_manager', 'users:view', 403],
  ] as const)('%s → %s = %i', async (role, permission, status) => {
    const res = await request(appWith(asAdmin(role), requirePermission(permission))).get(
      '/protected',
    );
    expect(res.status).toBe(status);
  });

  it('returns 401 when no admin is authenticated', async () => {
    const res = await request(appWith(anonymous, requirePermission('dashboard:view'))).get(
      '/protected',
    );
    expect(res.status).toBe(401);
  });
});

describe('requireActiveMember', () => {
  it.each([
    ['active', true, 200, undefined],
    ['active', false, 403, 'FORBIDDEN'],
    ['suspended', true, 403, 'ACCOUNT_SUSPENDED'],
    ['pending_deletion', true, 403, 'ACCOUNT_PENDING_DELETION'],
    ['banned', true, 403, 'ACCOUNT_BANNED'],
  ] as const)('%s (onboarded=%s) → %i', async (status, onboarded, httpStatus, code) => {
    const res = await request(appWith(asMember(status, onboarded), requireActiveMember)).get(
      '/protected',
    );
    expect(res.status).toBe(httpStatus);
    if (code) expect(res.body.error.code).toBe(code);
  });

  it('returns 401 when no member is authenticated', async () => {
    expect((await request(appWith(anonymous, requireActiveMember)).get('/protected')).status).toBe(
      401,
    );
  });
});
