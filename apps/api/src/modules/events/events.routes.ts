import { Router, type RequestHandler } from 'express';
import { eventIdOrSlugSchema, eventListQuerySchema } from '@garba-partner/shared';
import { ok, okPaginated } from '../../lib/response.js';
import { parseInput } from '../../lib/validation.js';
import type { EventsService } from './events.service.js';

/** Short shared caching: event pages are public and identical for every visitor. */
const PUBLIC_CACHE = 'public, max-age=60';

/**
 * Public event browsing, mounted at `/api/v1/events`. No authentication: visitors can browse
 * events before signing up. Only published events and public organizer fields are returned.
 */
export function createEventsRouter(deps: {
  service: EventsService;
  limiter: RequestHandler;
}): Router {
  const { service, limiter } = deps;
  const router = Router();
  router.use(limiter);

  router.get('/', async (req, res) => {
    const query = parseInput(eventListQuerySchema, req.query);
    const { items, meta } = await service.list(query);
    res.setHeader('Cache-Control', PUBLIC_CACHE);
    okPaginated(res, items, meta);
  });

  router.get('/:idOrSlug', async (req, res) => {
    const idOrSlug = parseInput(eventIdOrSlugSchema, req.params.idOrSlug);
    const event = await service.get(idOrSlug);
    res.setHeader('Cache-Control', PUBLIC_CACHE);
    ok(res, event);
  });

  return router;
}
