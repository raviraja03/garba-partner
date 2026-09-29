import { Router, type Request, type RequestHandler } from 'express';
import {
  adminBookingListQuerySchema,
  adminOrderListQuerySchema,
  adminRefundSchema,
  uuidParamSchema,
} from '@garba-partner/shared';
import { ok, okPaginated } from '../../../lib/response.js';
import { parseInput } from '../../../lib/validation.js';
import { adminAuth } from '../../../middlewares/authenticate.js';
import { requirePermission } from '../../../middlewares/authorize.js';
import type { AdminPaymentsService } from './admin-payments.service.js';

const actor = (req: Request) => ({ adminId: adminAuth(req).adminId, ip: req.ip ?? 'unknown' });

/** Orders, bookings and refunds, mounted at `/api/v1/admin/payments`. */
export function createAdminPaymentsRouter(deps: {
  service: AdminPaymentsService;
  authenticateAdmin: RequestHandler;
}): Router {
  const { service, authenticateAdmin } = deps;
  const router = Router();
  const canView = [authenticateAdmin, requirePermission('payments:view')];
  router.use((_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    next();
  });

  router.get('/orders', ...canView, async (req, res) => {
    const { items, meta } = await service.orders(parseInput(adminOrderListQuerySchema, req.query));
    okPaginated(res, items, meta);
  });

  router.get('/orders/:orderId', ...canView, async (req, res) => {
    ok(res, await service.order(parseInput(uuidParamSchema, req.params.orderId)));
  });

  router.get('/bookings', ...canView, async (req, res) => {
    const query = parseInput(adminBookingListQuerySchema, req.query);
    const { items, meta } = await service.bookings(query);
    okPaginated(res, items, meta);
  });

  router.get('/bookings/:bookingId', ...canView, async (req, res) => {
    ok(res, await service.booking(parseInput(uuidParamSchema, req.params.bookingId)));
  });

  router.post(
    '/bookings/:bookingId/refund',
    authenticateAdmin,
    requirePermission('payments:refund'),
    async (req, res) => {
      const bookingId = parseInput(uuidParamSchema, req.params.bookingId);
      const { reason } = parseInput(adminRefundSchema, req.body);
      ok(res, await service.refund(actor(req), bookingId, reason), 'Refund requested');
    },
  );

  return router;
}
