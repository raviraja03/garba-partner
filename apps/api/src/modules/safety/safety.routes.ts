import { Router, type Request, type RequestHandler } from 'express';
import { createBlockSchema, createReportSchema, uuidParamSchema } from '@garba-partner/shared';
import { ok } from '../../lib/response.js';
import { parseInput } from '../../lib/validation.js';
import { memberAuth } from '../../middlewares/authenticate.js';
import { requireMemberStatus } from '../../middlewares/authorize.js';
import type { BlocksService } from './blocks.service.js';
import type { ReportsService } from './reports.service.js';

const clientIp = (req: Request) => req.ip ?? 'unknown';

/**
 * Blocks (`/api/v1/blocks`) and reports (`/api/v1/reports`). Suspended members can still block
 * and report — protecting yourself must always be possible.
 */
export function createSafetyRouters(deps: {
  blocks: BlocksService;
  reports: ReportsService;
  authenticateMember: RequestHandler;
  blockLimiter: RequestHandler;
  reportLimiter: RequestHandler;
}): { blocks: Router; reports: Router } {
  const guard = [deps.authenticateMember, requireMemberStatus('active', 'suspended')];

  const blocks = Router();
  blocks.get('/', ...guard, async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    ok(res, await deps.blocks.list(memberAuth(req).userId));
  });
  blocks.post('/', ...guard, deps.blockLimiter, async (req, res) => {
    const { userId } = parseInput(createBlockSchema, req.body);
    const created = await deps.blocks.block(memberAuth(req).userId, userId, clientIp(req));
    ok(res, { userId, blocked: true }, 'Member blocked', created ? 201 : 200);
  });
  blocks.delete('/:userId', ...guard, async (req, res) => {
    const userId = parseInput(uuidParamSchema, req.params.userId);
    await deps.blocks.unblock(memberAuth(req).userId, userId);
    ok(res, { userId, blocked: false }, 'Member unblocked');
  });

  const reports = Router();
  reports.post('/', ...guard, deps.reportLimiter, async (req, res) => {
    const input = parseInput(createReportSchema, req.body);
    const result = await deps.reports.create(memberAuth(req).userId, input, clientIp(req));
    ok(
      res,
      result,
      'Thank you. Our team will review your report.',
      result.alreadyReported ? 200 : 201,
    );
  });

  return { blocks, reports };
}
