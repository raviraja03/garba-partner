import { Router } from 'express';
import { healthRouter } from './modules/health/health.routes.js';

/** Routes mounted under `/api/v1`. */
export function createApiRouter(): Router {
  const router = Router();
  router.use('/health', healthRouter);
  return router;
}
