import { Router, type Request, type RequestHandler } from 'express';
import {
  connectionListQuerySchema,
  sendInterestSchema,
  uuidParamSchema,
} from '@garba-partner/shared';
import { ok, okPaginated } from '../../lib/response.js';
import { parseInput } from '../../lib/validation.js';
import { memberAuth } from '../../middlewares/authenticate.js';
import { requireActiveMember } from '../../middlewares/authorize.js';
import type { InterestsService } from './interests.service.js';
import type { MatchesService } from './matches.service.js';

const noStore: RequestHandler = (_req, res, next) => {
  res.setHeader('Cache-Control', 'private, no-store');
  next();
};
const idParam = (req: Request, name: string) => parseInput(uuidParamSchema, req.params[name]);

/**
 * `/api/v1/interests`. Active, onboarded members only: suspended, banned and pending-deletion
 * accounts can't send, list, accept or reject. The acting member always comes from the token.
 */
export function createInterestsRouter(deps: {
  service: InterestsService;
  authenticateMember: RequestHandler;
  limiter: RequestHandler;
}): Router {
  const { service, authenticateMember, limiter } = deps;
  const router = Router();
  router.use(authenticateMember, requireActiveMember, noStore);

  router.post('/', limiter, async (req, res) => {
    const input = parseInput(sendInterestSchema, req.body);
    const { created, ...result } = await service.send(
      memberAuth(req).userId,
      input,
      req.ip ?? 'unknown',
    );
    const message = result.matched
      ? "It's a match!"
      : result.alreadySent
        ? 'Interest already sent'
        : 'Interest sent';
    ok(res, result, message, created ? 201 : 200);
  });

  router.get('/received', async (req, res) => {
    const query = parseInput(connectionListQuerySchema, req.query);
    const { items, meta } = await service.received(memberAuth(req).userId, query);
    okPaginated(res, items, meta);
  });

  router.get('/sent', async (req, res) => {
    const query = parseInput(connectionListQuerySchema, req.query);
    const { items, meta } = await service.sent(memberAuth(req).userId, query);
    okPaginated(res, items, meta);
  });

  router.post('/:interestId/accept', limiter, async (req, res) => {
    const match = await service.accept(memberAuth(req).userId, idParam(req, 'interestId'));
    ok(res, match, "It's a match!");
  });

  router.post('/:interestId/reject', limiter, async (req, res) => {
    await service.reject(memberAuth(req).userId, idParam(req, 'interestId'));
    ok(res, null, 'Interest declined');
  });

  router.delete('/:interestId', limiter, async (req, res) => {
    await service.withdraw(memberAuth(req).userId, idParam(req, 'interestId'));
    ok(res, null, 'Interest withdrawn');
  });

  return router;
}

/** `/api/v1/matches`: the member's own active matches only. */
export function createMatchesRouter(deps: {
  service: MatchesService;
  authenticateMember: RequestHandler;
  limiter: RequestHandler;
}): Router {
  const { service, authenticateMember, limiter } = deps;
  const router = Router();
  router.use(authenticateMember, requireActiveMember, noStore);

  router.get('/', async (req, res) => {
    const query = parseInput(connectionListQuerySchema, req.query);
    const { items, meta } = await service.list(memberAuth(req).userId, query);
    okPaginated(res, items, meta);
  });

  router.get('/:matchId', async (req, res) => {
    ok(res, await service.get(memberAuth(req).userId, idParam(req, 'matchId')));
  });

  router.post('/:matchId/unmatch', limiter, async (req, res) => {
    await service.unmatch(memberAuth(req).userId, idParam(req, 'matchId'));
    ok(res, null, 'Unmatched');
  });

  return router;
}
