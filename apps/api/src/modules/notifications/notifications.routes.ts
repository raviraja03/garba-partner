import { Router, type RequestHandler } from 'express';
import {
  notificationListQuerySchema,
  updateNotificationPreferencesSchema,
  uuidParamSchema,
} from '@garba-partner/shared';
import { ok, okPaginated } from '../../lib/response.js';
import { parseInput } from '../../lib/validation.js';
import { memberAuth } from '../../middlewares/authenticate.js';
import { requireMemberStatus } from '../../middlewares/authorize.js';
import type { NotificationsService } from './notifications.service.js';

/**
 * Member notifications, mounted at `/api/v1/notifications`. Suspended members can read theirs
 * (safety notices explain the suspension). Everything is scoped to the caller.
 */
export function createNotificationsRouter(deps: {
  service: NotificationsService;
  authenticateMember: RequestHandler;
  limiter: RequestHandler;
}): Router {
  const { service, limiter } = deps;
  const router = Router();
  router.use(
    deps.authenticateMember,
    requireMemberStatus('active', 'suspended'),
    (_req, res, next) => {
      res.setHeader('Cache-Control', 'private, no-store');
      next();
    },
  );

  router.get('/', async (req, res) => {
    const query = parseInput(notificationListQuerySchema, req.query);
    const { items, meta } = await service.list(memberAuth(req).userId, query);
    okPaginated(res, items, meta);
  });

  router.get('/unread-count', async (req, res) => {
    ok(res, { unread: await service.unreadCount(memberAuth(req).userId) });
  });

  router.post('/read-all', limiter, async (req, res) => {
    ok(res, await service.markAllRead(memberAuth(req).userId), 'All notifications read');
  });

  router.get('/preferences', async (req, res) => {
    ok(res, await service.preferences(memberAuth(req).userId));
  });

  router.put('/preferences', limiter, async (req, res) => {
    const input = parseInput(updateNotificationPreferencesSchema, req.body);
    ok(res, await service.updatePreferences(memberAuth(req).userId, input), 'Preferences saved');
  });

  router.post('/:notificationId/read', limiter, async (req, res) => {
    const id = parseInput(uuidParamSchema, req.params.notificationId);
    ok(res, await service.markRead(memberAuth(req).userId, id), 'Notification read');
  });

  return router;
}
