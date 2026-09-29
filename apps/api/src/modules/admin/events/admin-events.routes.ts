import { Router, type Request, type RequestHandler } from 'express';
import {
  eventPassSettingsSchema,
  adminEventListQuerySchema,
  createEventSchema,
  updateEventSchema,
  uuidParamSchema,
} from '@garba-partner/shared';
import { AppError } from '../../../lib/app-error.js';
import { ok, okPaginated } from '../../../lib/response.js';
import { parseInput } from '../../../lib/validation.js';
import { adminAuth } from '../../../middlewares/authenticate.js';
import { requirePermission } from '../../../middlewares/authorize.js';
import { singleImageUpload } from '../../../middlewares/upload.js';
import type { AdminActor } from '../users/admin-users.service.js';
import type { AdminEventsService } from './admin-events.service.js';

function actor(req: Request): AdminActor {
  return { adminId: adminAuth(req).adminId, ip: req.ip ?? 'unknown' };
}

const eventId = (req: Request) => parseInput(uuidParamSchema, req.params.eventId);

/** Event management, mounted at `/api/v1/admin/events`. */
export function createAdminEventsRouter(deps: {
  service: AdminEventsService;
  authenticateAdmin: RequestHandler;
}): Router {
  const { service, authenticateAdmin } = deps;
  const router = Router();
  const canView = [authenticateAdmin, requirePermission('events:view')];
  const canManage = [authenticateAdmin, requirePermission('events:manage')];

  router.use((_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    next();
  });

  router.get('/', ...canView, async (req, res) => {
    const query = parseInput(adminEventListQuerySchema, req.query);
    const { items, meta } = await service.list(query);
    okPaginated(res, items, meta);
  });

  router.get('/:eventId', ...canView, async (req, res) => {
    ok(res, await service.get(eventId(req)));
  });

  router.post('/', ...canManage, async (req, res) => {
    const input = parseInput(createEventSchema, req.body);
    ok(res, await service.create(actor(req), input), 'Event created as a draft', 201);
  });

  router.patch('/:eventId', ...canManage, async (req, res) => {
    const input = parseInput(updateEventSchema, req.body);
    ok(res, await service.update(actor(req), eventId(req), input), 'Event updated');
  });

  router.post('/:eventId/image', ...canManage, singleImageUpload('image'), async (req, res) => {
    if (!req.file) throw new AppError('VALIDATION_ERROR', { message: 'No image received.' });
    ok(res, await service.uploadImage(actor(req), eventId(req), req.file.buffer), 'Image updated');
  });

  router.delete('/:eventId/image', ...canManage, async (req, res) => {
    ok(res, await service.deleteImage(actor(req), eventId(req)), 'Image removed');
  });

  const actions = {
    publish: 'Event published',
    unpublish: 'Event unpublished',
    verify: 'Event verified',
    unverify: 'Event verification removed',
    archive: 'Event archived',
    restore: 'Event restored as a draft',
  } as const;
  for (const [action, message] of Object.entries(actions) as [keyof typeof actions, string][]) {
    router.post(`/:eventId/${action}`, ...canManage, async (req, res) => {
      ok(res, await service[action](actor(req), eventId(req)), message);
    });
  }

  router.put('/:eventId/pass', ...canManage, async (req, res) => {
    const eventId = parseInput(uuidParamSchema, req.params.eventId);
    const input = parseInput(eventPassSettingsSchema, req.body);
    ok(res, await service.updatePass(actor(req), eventId, input), 'Pass settings saved');
  });

  router.delete('/:eventId', ...canManage, async (req, res) => {
    const id = eventId(req);
    await service.remove(actor(req), id);
    ok(res, { id, deleted: true }, 'Event deleted');
  });

  return router;
}
