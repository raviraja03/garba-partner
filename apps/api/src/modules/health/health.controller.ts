import type { RequestHandler } from 'express';
import type { HealthDto } from '@garba-partner/shared';
import { ok } from '../../lib/response.js';

export const getHealth: RequestHandler = (_req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  const data: HealthDto = { status: 'ok', timestamp: new Date().toISOString() };
  ok(res, data, 'OK');
};
