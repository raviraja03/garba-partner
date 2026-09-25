import { Router } from 'express';
import { createHealthController, type HealthDependencies } from './health.controller.js';

export function createHealthRouter(dependencies: HealthDependencies): Router {
  const router = Router();
  router.get('/', createHealthController(dependencies));
  return router;
}
