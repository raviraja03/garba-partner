import { Router, type Request, type RequestHandler } from 'express';
import { adminUserActionSchema, uuidParamSchema } from '@garba-partner/shared';
import { ok } from '../../../lib/response.js';
import { parseInput } from '../../../lib/validation.js';
import { adminAuth } from '../../../middlewares/authenticate.js';
import { requirePermission } from '../../../middlewares/authorize.js';
import type { AdminActor } from '../users/admin-users.service.js';
import type { AdminMatchesService } from './admin-matches.service.js';

function actor(req: Request): AdminActor {
  return { adminId: adminAuth(req).adminId, ip: req.ip ?? 'unknown' };
}

/**
 * Match moderation. Mounted at `/api/v1/admin`:
 * - `GET  /admin/users/:userId/matches` — `users:view`
 * - `POST /admin/matches/:matchId/close` — `users:sanction`, `{ reason }` (audited)
 */
export function createAdminMatchesRouter(deps: {
  service: AdminMatchesService;
  authenticateAdmin: RequestHandler;
}): Router {
  const { service, authenticateAdmin } = deps;
  const router = Router();
  const noStore: RequestHandler = (_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    next();
  };

  router.get(
    '/users/:userId/matches',
    authenticateAdmin,
    requirePermission('users:view'),
    noStore,
    async (req, res) => {
      const userId = parseInput(uuidParamSchema, req.params.userId);
      ok(res, await service.listForUser(userId));
    },
  );

  router.post(
    '/matches/:matchId/close',
    authenticateAdmin,
    requirePermission('users:sanction'),
    noStore,
    async (req, res) => {
      const matchId = parseInput(uuidParamSchema, req.params.matchId);
      const { reason } = parseInput(adminUserActionSchema, req.body);
      ok(res, await service.close(actor(req), matchId, reason), 'Match closed');
    },
  );

  return router;
}
