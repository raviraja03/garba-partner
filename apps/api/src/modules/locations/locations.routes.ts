import { Router } from 'express';
import { uuidParamSchema } from '@garba-partner/shared';
import { ok } from '../../lib/response.js';
import { parseInput } from '../../lib/validation.js';
import { listActiveAreas, listActiveCities } from './locations.service.js';

/** Public reference data, mounted at `/api/v1/cities`. */
export function createLocationsRouter(): Router {
  const router = Router();

  router.get('/', async (_req, res) => {
    res.setHeader('Cache-Control', 'public, max-age=300');
    ok(res, await listActiveCities());
  });

  router.get('/:cityId/areas', async (req, res) => {
    const cityId = parseInput(uuidParamSchema, req.params.cityId);
    res.setHeader('Cache-Control', 'public, max-age=300');
    ok(res, await listActiveAreas(cityId));
  });

  return router;
}
