import { Router, type RequestHandler } from 'express';
import { ok } from '../../../lib/response.js';
import { requirePermission } from '../../../middlewares/authorize.js';
import type { AdminNotificationsService } from './admin-notifications.service.js';

/**
 * Notification monitoring, mounted at `/api/v1/admin/notifications`. Aggregates only, so it is
 * available to every admin role (`dashboard:view`).
 */
export function createAdminNotificationsRouter(deps: {
  service: AdminNotificationsService;
  authenticateAdmin: RequestHandler;
}): Router {
  const router = Router();
  router.get(
    '/stats',
    deps.authenticateAdmin,
    requirePermission('dashboard:view'),
    async (_req, res) => {
      res.setHeader('Cache-Control', 'no-store');
      ok(res, await deps.service.stats());
    },
  );
  return router;
}
