import { Router, type RequestHandler } from 'express';
import { adminAuditLogQuerySchema, adminSafetyLogQuerySchema } from '@garba-partner/shared';
import { okPaginated } from '../../../lib/response.js';
import { parseInput } from '../../../lib/validation.js';
import { requirePermission } from '../../../middlewares/authorize.js';
import type { AdminLogsService } from './admin-logs.service.js';

/**
 * Log viewers, mounted at `/api/v1/admin`: `GET /safety-logs` (`safety_logs:view`, moderators)
 * and `GET /audit-logs` (`audit:view`, super admins). Read-only.
 */
export function createAdminLogsRouter(deps: {
  service: AdminLogsService;
  authenticateAdmin: RequestHandler;
}): Router {
  const { service, authenticateAdmin } = deps;
  const router = Router();

  router.get(
    '/safety-logs',
    authenticateAdmin,
    requirePermission('safety_logs:view'),
    async (req, res) => {
      const query = parseInput(adminSafetyLogQuerySchema, req.query);
      const { items, meta } = await service.safetyLogs(query);
      res.setHeader('Cache-Control', 'no-store');
      okPaginated(res, items, meta);
    },
  );

  router.get(
    '/audit-logs',
    authenticateAdmin,
    requirePermission('audit:view'),
    async (req, res) => {
      const query = parseInput(adminAuditLogQuerySchema, req.query);
      const { items, meta } = await service.auditLogs(query);
      res.setHeader('Cache-Control', 'no-store');
      okPaginated(res, items, meta);
    },
  );

  return router;
}
