import { Router, type Request, type RequestHandler } from 'express';
import {
  adminOrganizerListQuerySchema,
  createOrganizerSchema,
  roleHasPermission,
  updateOrganizerSchema,
  uuidParamSchema,
} from '@garba-partner/shared';
import { ok, okPaginated } from '../../../lib/response.js';
import { parseInput } from '../../../lib/validation.js';
import { adminAuth } from '../../../middlewares/authenticate.js';
import { requirePermission } from '../../../middlewares/authorize.js';
import type { AdminActor } from '../users/admin-users.service.js';
import type { AdminOrganizersService } from './admin-organizers.service.js';

function actor(req: Request): AdminActor {
  return { adminId: adminAuth(req).adminId, ip: req.ip ?? 'unknown' };
}

const organizerId = (req: Request) => parseInput(uuidParamSchema, req.params.organizerId);

/** Organizer management, mounted at `/api/v1/admin/organizers`. */
export function createAdminOrganizersRouter(deps: {
  service: AdminOrganizersService;
  authenticateAdmin: RequestHandler;
}): Router {
  const { service, authenticateAdmin } = deps;
  const router = Router();
  const canView = [authenticateAdmin, requirePermission('events:view')];
  const canManage = [authenticateAdmin, requirePermission('events:manage')];

  // Admin responses can contain private contact details: never cache them.
  router.use((_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    next();
  });

  router.get('/', ...canView, async (req, res) => {
    const query = parseInput(adminOrganizerListQuerySchema, req.query);
    const { items, meta } = await service.list(query);
    okPaginated(res, items, meta);
  });

  router.get('/options', ...canView, async (_req, res) => {
    ok(res, await service.options());
  });

  router.get('/:organizerId', ...canView, async (req, res) => {
    const canSeeContact = roleHasPermission(adminAuth(req).role, 'events:manage');
    ok(res, await service.get(organizerId(req), { canSeeContact }));
  });

  router.post('/', ...canManage, async (req, res) => {
    const input = parseInput(createOrganizerSchema, req.body);
    ok(res, await service.create(actor(req), input), 'Organizer created', 201);
  });

  router.patch('/:organizerId', ...canManage, async (req, res) => {
    const input = parseInput(updateOrganizerSchema, req.body);
    ok(res, await service.update(actor(req), organizerId(req), input), 'Organizer updated');
  });

  const actions = {
    verify: 'Organizer verified',
    unverify: 'Organizer verification removed',
    archive: 'Organizer archived',
    restore: 'Organizer restored',
  } as const;
  for (const [action, message] of Object.entries(actions) as [keyof typeof actions, string][]) {
    router.post(`/:organizerId/${action}`, ...canManage, async (req, res) => {
      ok(res, await service[action](actor(req), organizerId(req)), message);
    });
  }

  return router;
}
