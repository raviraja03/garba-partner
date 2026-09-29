import { Router, type Request, type RequestHandler } from 'express';
import {
  adminReportListQuerySchema,
  adminResolveReportSchema,
  uuidParamSchema,
} from '@garba-partner/shared';
import { ok, okPaginated } from '../../../lib/response.js';
import { parseInput } from '../../../lib/validation.js';
import { adminAuth } from '../../../middlewares/authenticate.js';
import { requirePermission } from '../../../middlewares/authorize.js';
import type { AdminActor } from '../users/admin-users.service.js';
import type { AdminReportsService } from './admin-reports.service.js';

function actor(req: Request): AdminActor {
  return { adminId: adminAuth(req).adminId, ip: req.ip ?? 'unknown' };
}

const reportId = (req: Request) => parseInput(uuidParamSchema, req.params.reportId);

/** Reports queue, mounted at `/api/v1/admin/reports`. `reports:manage` for everything. */
export function createAdminReportsRouter(deps: {
  service: AdminReportsService;
  authenticateAdmin: RequestHandler;
}): Router {
  const { service, authenticateAdmin } = deps;
  const router = Router();
  router.use(authenticateAdmin, requirePermission('reports:manage'), (_req, res, next) => {
    // Evidence and conversations must never be cached anywhere.
    res.setHeader('Cache-Control', 'no-store');
    next();
  });

  router.get('/', async (req, res) => {
    const query = parseInput(adminReportListQuerySchema, req.query);
    const { items, meta } = await service.list(query);
    okPaginated(res, items, meta);
  });

  router.get('/:reportId', async (req, res) => {
    ok(res, await service.get(reportId(req)));
  });

  router.get('/:reportId/conversation', async (req, res) => {
    ok(res, await service.conversation(actor(req), reportId(req)));
  });

  router.post('/:reportId/assign', async (req, res) => {
    ok(res, await service.assign(actor(req), reportId(req)), 'Report assigned to you');
  });

  router.post('/:reportId/resolve', async (req, res) => {
    const input = parseInput(adminResolveReportSchema, req.body);
    ok(res, await service.resolve(actor(req), reportId(req), input), 'Report resolved');
  });

  return router;
}
