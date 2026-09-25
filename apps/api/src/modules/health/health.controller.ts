import type { RequestHandler } from 'express';
import type { HealthDto } from '@garba-partner/shared';
import { AppError } from '../../lib/app-error.js';
import { ok } from '../../lib/response.js';

export interface HealthDependencies {
  /** Resolves true when the database answers; must never throw. */
  pingDatabase: () => Promise<boolean>;
}

/**
 * `GET /api/v1/health`: 200 when the API and database are up, otherwise 503
 * SERVICE_UNAVAILABLE. Internal error details are never exposed.
 */
export function createHealthController({ pingDatabase }: HealthDependencies): RequestHandler {
  return async (_req, res) => {
    res.setHeader('Cache-Control', 'no-store');

    if (!(await pingDatabase())) {
      throw new AppError('SERVICE_UNAVAILABLE', { message: 'Database is unavailable.' });
    }

    const data: HealthDto = {
      status: 'ok',
      database: 'ok',
      timestamp: new Date().toISOString(),
    };
    ok(res, data, 'OK');
  };
}
