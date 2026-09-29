import { Router, type Request, type RequestHandler } from 'express';
import { setAttendanceSchema, uuidParamSchema } from '@garba-partner/shared';
import { ok } from '../../lib/response.js';
import { parseInput } from '../../lib/validation.js';
import { memberAuth } from '../../middlewares/authenticate.js';
import { requireActiveMember, requireMemberStatus } from '../../middlewares/authorize.js';
import type { AttendanceService } from './attendance.service.js';

const eventId = (req: Request) => parseInput(uuidParamSchema, req.params.eventId);
const noStore: RequestHandler = (_req, res, next) => {
  res.setHeader('Cache-Control', 'private, no-store');
  next();
};

/** `/api/v1/events/:eventId/attendance` — the member's own attendance only (no IDOR: userId comes from the token). */
export function createAttendanceRouter(deps: {
  service: AttendanceService;
  authenticateMember: RequestHandler;
  limiter: RequestHandler;
}): Router {
  const { service, authenticateMember, limiter } = deps;
  const router = Router();
  const canRead = [authenticateMember, requireMemberStatus('active', 'suspended'), noStore];
  const canWrite = [authenticateMember, requireActiveMember, limiter, noStore];

  router.get('/:eventId/attendance', ...canRead, async (req, res) => {
    ok(res, await service.get(memberAuth(req).userId, eventId(req)));
  });

  router.put('/:eventId/attendance', ...canWrite, async (req, res) => {
    const input = parseInput(setAttendanceSchema, req.body);
    ok(res, await service.set(memberAuth(req).userId, eventId(req), input), 'Attendance saved');
  });

  router.delete('/:eventId/attendance', ...canWrite, async (req, res) => {
    await service.clear(memberAuth(req).userId, eventId(req));
    ok(res, null, 'Attendance removed');
  });

  return router;
}

/** `/api/v1/me/attendance` — the member's upcoming events. */
export function createMyAttendanceRouter(deps: {
  service: AttendanceService;
  authenticateMember: RequestHandler;
}): Router {
  const router = Router();
  router.get(
    '/attendance',
    deps.authenticateMember,
    requireMemberStatus('active', 'suspended'),
    noStore,
    async (req, res) => {
      ok(res, await deps.service.listMine(memberAuth(req).userId));
    },
  );
  return router;
}
