import type { Request, RequestHandler, Response } from 'express';
import type { ServerEnv } from '@garba-partner/config/server';
import { ADMIN_REFRESH_COOKIE, adminLoginSchema } from '@garba-partner/shared';
import { AppError } from '../../../lib/app-error.js';
import { readCookie, refreshCookieOptions } from '../../../lib/cookies.js';
import { ok } from '../../../lib/response.js';
import { parseInput } from '../../../lib/validation.js';
import { adminAuth } from '../../../middlewares/authenticate.js';
import type { ClientContext } from '../../auth/auth.service.js';
import type { AdminAuthService, IssuedAdminSession } from './admin-auth.service.js';

/** The admin refresh cookie is only sent to these endpoints. */
export const ADMIN_AUTH_COOKIE_PATH = '/api/v1/admin/auth';

export interface AdminAuthController {
  login: RequestHandler;
  refresh: RequestHandler;
  logout: RequestHandler;
  me: RequestHandler;
}

function clientContext(req: Request): ClientContext {
  return { ip: req.ip ?? 'unknown', userAgent: req.get('User-Agent') };
}

export function createAdminAuthController(
  service: AdminAuthService,
  env: Pick<ServerEnv, 'APP_ENV'>,
): AdminAuthController {
  const sendSession = (res: Response, issued: IssuedAdminSession, message: string) => {
    res.cookie(
      ADMIN_REFRESH_COOKIE,
      issued.refreshToken,
      refreshCookieOptions(env, ADMIN_AUTH_COOKIE_PATH, issued.refreshTokenExpiresAt),
    );
    res.setHeader('Cache-Control', 'no-store');
    ok(res, issued.session, message);
  };
  const clearCookie = (res: Response) => {
    res.clearCookie(ADMIN_REFRESH_COOKIE, refreshCookieOptions(env, ADMIN_AUTH_COOKIE_PATH));
  };

  return {
    async login(req, res) {
      const { email, password } = parseInput(adminLoginSchema, req.body);
      sendSession(res, await service.login(email, password, clientContext(req)), 'Logged in');
    },

    async refresh(req, res) {
      const token = readCookie(req.cookies, ADMIN_REFRESH_COOKIE);
      if (!token) throw new AppError('REFRESH_INVALID');
      try {
        sendSession(res, await service.refresh(token, clientContext(req)), 'Session refreshed');
      } catch (error) {
        clearCookie(res);
        throw error;
      }
    },

    async logout(req, res) {
      const admin = adminAuth(req);
      await service.logout(admin.adminId, admin.sessionId);
      clearCookie(res);
      ok(res, null, 'Logged out');
    },

    async me(req, res) {
      res.setHeader('Cache-Control', 'no-store');
      ok(res, await service.getMe(adminAuth(req).adminId));
    },
  };
}
