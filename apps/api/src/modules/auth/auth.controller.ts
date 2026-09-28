import type { Request, RequestHandler, Response } from 'express';
import type { ServerEnv } from '@garba-partner/config/server';
import {
  MEMBER_REFRESH_COOKIE,
  logoutSchema,
  sendOtpSchema,
  verifyOtpSchema,
} from '@garba-partner/shared';
import { AppError } from '../../lib/app-error.js';
import { readCookie, refreshCookieOptions } from '../../lib/cookies.js';
import { ok } from '../../lib/response.js';
import { parseInput } from '../../lib/validation.js';
import { memberAuth } from '../../middlewares/authenticate.js';
import type { ClientContext, IssuedMemberSession, MemberAuthService } from './auth.service.js';

/** The refresh cookie is only sent to these endpoints. */
export const MEMBER_AUTH_COOKIE_PATH = '/api/v1/auth';

export interface MemberAuthController {
  sendOtp: RequestHandler;
  verifyOtp: RequestHandler;
  refresh: RequestHandler;
  logout: RequestHandler;
  me: RequestHandler;
}

function clientContext(req: Request): ClientContext {
  return { ip: req.ip ?? 'unknown', userAgent: req.get('User-Agent') };
}

export function createMemberAuthController(
  service: MemberAuthService,
  env: Pick<ServerEnv, 'APP_ENV'>,
): MemberAuthController {
  const sendSession = (res: Response, issued: IssuedMemberSession, message: string) => {
    res.cookie(
      MEMBER_REFRESH_COOKIE,
      issued.refreshToken,
      refreshCookieOptions(env, MEMBER_AUTH_COOKIE_PATH, issued.refreshTokenExpiresAt),
    );
    res.setHeader('Cache-Control', 'no-store');
    ok(res, issued.session, message);
  };

  return {
    async sendOtp(req, res) {
      const { phone } = parseInput(sendOtpSchema, req.body);
      const result = await service.sendOtp(phone, clientContext(req));
      res.setHeader('Cache-Control', 'no-store');
      ok(res, result, 'If this number can receive codes, one has been sent.');
    },

    async verifyOtp(req, res) {
      const { phone, code } = parseInput(verifyOtpSchema, req.body);
      const issued = await service.verifyOtp(phone, code, clientContext(req));
      sendSession(res, issued, 'Logged in');
    },

    async refresh(req, res) {
      const token = readCookie(req.cookies, MEMBER_REFRESH_COOKIE);
      if (!token) throw new AppError('REFRESH_INVALID');
      try {
        sendSession(res, await service.refresh(token, clientContext(req)), 'Session refreshed');
      } catch (error) {
        res.clearCookie(MEMBER_REFRESH_COOKIE, refreshCookieOptions(env, MEMBER_AUTH_COOKIE_PATH));
        throw error;
      }
    },

    async logout(req, res) {
      const { allDevices = false } = parseInput(logoutSchema, req.body ?? {});
      const auth = memberAuth(req);
      await service.logout(auth.userId, auth.sessionId, allDevices);
      res.clearCookie(MEMBER_REFRESH_COOKIE, refreshCookieOptions(env, MEMBER_AUTH_COOKIE_PATH));
      ok(res, null, 'Logged out');
    },

    async me(req, res) {
      const user = await service.getMe(memberAuth(req).userId);
      res.setHeader('Cache-Control', 'no-store');
      ok(res, user);
    },
  };
}
