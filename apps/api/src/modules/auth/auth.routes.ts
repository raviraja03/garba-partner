import { Router, type RequestHandler } from 'express';
import type { AuthRateLimiters } from '../../middlewares/rate-limit.js';
import type { MemberAuthController } from './auth.controller.js';

/** Member authentication routes, mounted at `/api/v1/auth`. */
export function createMemberAuthRouter(deps: {
  controller: MemberAuthController;
  authenticateMember: RequestHandler;
  csrf: RequestHandler;
  limiters: AuthRateLimiters;
}): Router {
  const { controller, authenticateMember, csrf, limiters } = deps;
  const router = Router();

  router.post('/send-otp', limiters.sendOtp, controller.sendOtp);
  router.post('/verify-otp', limiters.verifyOtp, controller.verifyOtp);
  router.post('/refresh', limiters.refresh, csrf, controller.refresh);
  router.post('/logout', authenticateMember, controller.logout);
  router.get('/me', authenticateMember, controller.me);

  return router;
}
