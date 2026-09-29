import { Router, type RequestHandler } from 'express';
import { partnerListQuerySchema, uuidParamSchema } from '@garba-partner/shared';
import { ok, okPaginated } from '../../lib/response.js';
import { parseInput } from '../../lib/validation.js';
import { memberAuth } from '../../middlewares/authenticate.js';
import { requireActiveMember } from '../../middlewares/authorize.js';
import type { DiscoveryService } from './discovery.service.js';

/**
 * Partner discovery, mounted at `/api/v1/partners`. Active, onboarded members only: suspended,
 * banned and pending-deletion accounts cannot browse other members.
 */
export function createDiscoveryRouter(deps: {
  service: DiscoveryService;
  authenticateMember: RequestHandler;
  limiter: RequestHandler;
}): Router {
  const { service, authenticateMember, limiter } = deps;
  const router = Router();
  router.use(authenticateMember, requireActiveMember, limiter, (_req, res, next) => {
    // Results are personal (they depend on the viewer and their blocks).
    res.setHeader('Cache-Control', 'private, no-store');
    next();
  });

  router.get('/', async (req, res) => {
    const query = parseInput(partnerListQuerySchema, req.query);
    const { items, meta } = await service.list(memberAuth(req).userId, query);
    okPaginated(res, items, meta);
  });

  router.get('/:userId', async (req, res) => {
    const partnerId = parseInput(uuidParamSchema, req.params.userId);
    ok(res, await service.get(memberAuth(req).userId, partnerId));
  });

  return router;
}
