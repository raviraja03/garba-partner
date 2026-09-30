import { Router, type RequestHandler } from 'express';
import type { AuthRateLimiters } from '../../../middlewares/rate-limit.js';
import type { AdminAuthController } from './admin-auth.controller.js';

/** Admin authentication routes, mounted at `/api/v1/admin/auth`. */
export function createAdminAuthRouter(deps: {
  controller: AdminAuthController;
  authenticateAdmin: RequestHandler;
  csrf: RequestHandler;
  limiters: AuthRateLimiters;
}): Router {
  const { controller, authenticateAdmin, csrf, limiters } = deps;
  const router = Router();

  // Two steps: password → challenge, then the authenticator code → session.
  router.post('/login', limiters.adminLogin, controller.login);
  router.post('/login/totp-setup', limiters.adminMfa, controller.setupTotp);
  router.post('/login/verify', limiters.adminMfa, controller.verify);
  router.post('/refresh', limiters.refresh, csrf, controller.refresh);
  router.post('/logout', authenticateAdmin, controller.logout);
  router.get('/me', authenticateAdmin, controller.me);

  return router;
}
