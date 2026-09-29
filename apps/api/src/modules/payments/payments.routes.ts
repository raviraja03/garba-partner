import { Router, type Request, type RequestHandler } from 'express';
import {
  bookingListQuerySchema,
  createOrderSchema,
  idempotencyKeySchema,
  uuidParamSchema,
  verifyPaymentSchema,
} from '@garba-partner/shared';
import { AppError } from '../../lib/app-error.js';
import { ok, okPaginated } from '../../lib/response.js';
import { parseInput } from '../../lib/validation.js';
import { memberAuth } from '../../middlewares/authenticate.js';
import { requireActiveMember, requireMemberStatus } from '../../middlewares/authorize.js';
import type { PaymentsService } from './payments.service.js';

/** Path of the Razorpay webhook; `app.ts` keeps the raw body for this path only. */
export const RAZORPAY_WEBHOOK_PATH = '/webhooks/razorpay';

const noStore: RequestHandler = (_req, res, next) => {
  res.setHeader('Cache-Control', 'private, no-store');
  next();
};

const orderId = (req: Request) => parseInput(uuidParamSchema, req.params.orderId);

/**
 * Checkout, mounted at `/api/v1/orders` (active members only). Creating an order needs an
 * `Idempotency-Key` header: retries with the same key return the same order.
 */
export function createOrdersRouter(deps: {
  service: PaymentsService;
  authenticateMember: RequestHandler;
  orderLimiter: RequestHandler;
  verifyLimiter: RequestHandler;
}): Router {
  const { service } = deps;
  const router = Router();
  router.use(deps.authenticateMember, requireActiveMember, noStore);

  router.post('/', deps.orderLimiter, async (req, res) => {
    const key = parseInput(idempotencyKeySchema, req.get('idempotency-key') ?? '');
    const input = parseInput(createOrderSchema, req.body);
    const { result, created } = await service.createOrder(memberAuth(req).userId, input, key);
    ok(res, result, created ? 'Order created' : 'Order already created', created ? 201 : 200);
  });

  router.get('/:orderId', async (req, res) => {
    ok(res, await service.getOrder(memberAuth(req).userId, orderId(req)));
  });

  router.post('/:orderId/verify', deps.verifyLimiter, async (req, res) => {
    const input = parseInput(verifyPaymentSchema, req.body);
    const result = await service.verify(memberAuth(req).userId, orderId(req), input);
    ok(res, result, result.booking ? 'Payment verified' : 'Payment received');
  });

  return router;
}

/** The member's passes, mounted at `/api/v1/bookings`. Suspended members can still see them. */
export function createBookingsRouter(deps: {
  service: PaymentsService;
  authenticateMember: RequestHandler;
}): Router {
  const { service } = deps;
  const router = Router();
  router.use(deps.authenticateMember, requireMemberStatus('active', 'suspended'), noStore);

  router.get('/', async (req, res) => {
    const query = parseInput(bookingListQuerySchema, req.query);
    const { items, meta } = await service.listBookings(memberAuth(req).userId, query);
    okPaginated(res, items, meta);
  });

  router.get('/:bookingId', async (req, res) => {
    const bookingId = parseInput(uuidParamSchema, req.params.bookingId);
    ok(res, await service.getBooking(memberAuth(req).userId, bookingId));
  });

  return router;
}

/**
 * `POST /api/v1/webhooks/razorpay`. No session: authenticity comes from the HMAC signature over
 * the raw body. 2xx = handled (or a duplicate); errors make Razorpay retry.
 */
export function createPaymentWebhookRouter(deps: { service: PaymentsService }): Router {
  const router = Router();
  router.post(RAZORPAY_WEBHOOK_PATH, async (req, res) => {
    if (!req.rawBody) throw new AppError('VALIDATION_ERROR', { message: 'Missing body.' });
    const { duplicate } = await deps.service.handleWebhook(req.rawBody, req.headers);
    ok(res, { received: true, duplicate });
  });
  return router;
}
