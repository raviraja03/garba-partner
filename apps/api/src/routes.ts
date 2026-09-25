import { Router } from 'express';
import type { HealthDependencies } from './modules/health/health.controller.js';
import { createHealthRouter } from './modules/health/health.routes.js';

export type ApiDependencies = HealthDependencies;

/** Routes mounted under `/api/v1`. */
export function createApiRouter(dependencies: ApiDependencies): Router {
  const router = Router();
  router.use('/health', createHealthRouter(dependencies));
  return router;
}
