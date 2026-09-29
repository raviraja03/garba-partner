import { Router, type Request, type RequestHandler } from 'express';
import {
  adminUserActionSchema,
  adminUserListQuerySchema,
  uuidParamSchema,
} from '@garba-partner/shared';
import { ok, okPaginated } from '../../../lib/response.js';
import { parseInput } from '../../../lib/validation.js';
import { adminAuth } from '../../../middlewares/authenticate.js';
import { requirePermission } from '../../../middlewares/authorize.js';
import type { AdminActor, AdminUsersService } from './admin-users.service.js';

function actor(req: Request): AdminActor {
  return { adminId: adminAuth(req).adminId, ip: req.ip ?? 'unknown' };
}

/** Admin user management, mounted at `/api/v1/admin/users`. */
export function createAdminUsersRouter(deps: {
  service: AdminUsersService;
  authenticateAdmin: RequestHandler;
}): Router {
  const { service, authenticateAdmin } = deps;
  const router = Router();
  const canView = [authenticateAdmin, requirePermission('users:view')];
  const canSanction = [authenticateAdmin, requirePermission('users:sanction')];

  router.get('/', ...canView, async (req, res) => {
    const query = parseInput(adminUserListQuerySchema, req.query);
    const { items, meta } = await service.list(query);
    res.setHeader('Cache-Control', 'no-store');
    okPaginated(res, items, meta);
  });

  router.get('/:userId', ...canView, async (req, res) => {
    const userId = parseInput(uuidParamSchema, req.params.userId);
    res.setHeader('Cache-Control', 'no-store');
    ok(res, await service.get(userId));
  });

  router.post('/:userId/suspend', ...canSanction, async (req, res) => {
    const userId = parseInput(uuidParamSchema, req.params.userId);
    const { reason } = parseInput(adminUserActionSchema, req.body);
    ok(res, await service.suspend(actor(req), userId, reason), 'User suspended');
  });

  router.post('/:userId/reactivate', ...canSanction, async (req, res) => {
    const userId = parseInput(uuidParamSchema, req.params.userId);
    const { reason } = parseInput(adminUserActionSchema, req.body);
    ok(res, await service.reactivate(actor(req), userId, reason), 'User reactivated');
  });

  router.post('/:userId/restrict-interactions', ...canSanction, async (req, res) => {
    const userId = parseInput(uuidParamSchema, req.params.userId);
    const { reason } = parseInput(adminUserActionSchema, req.body);
    ok(
      res,
      await service.restrictInteractions(actor(req), userId, reason),
      'Interactions restricted',
    );
  });

  router.post('/:userId/lift-interaction-restriction', ...canSanction, async (req, res) => {
    const userId = parseInput(uuidParamSchema, req.params.userId);
    const { reason } = parseInput(adminUserActionSchema, req.body);
    ok(
      res,
      await service.liftInteractionRestriction(actor(req), userId, reason),
      'Restriction lifted',
    );
  });

  return router;
}
