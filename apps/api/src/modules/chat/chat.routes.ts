import { Router, type Request, type RequestHandler } from 'express';
import {
  markReadSchema,
  messageListQuerySchema,
  sendMessageSchema,
  uuidParamSchema,
} from '@garba-partner/shared';
import { ok, okPaginated } from '../../lib/response.js';
import { parseInput } from '../../lib/validation.js';
import { memberAuth } from '../../middlewares/authenticate.js';
import { requireActiveMember } from '../../middlewares/authorize.js';
import type { ChatService } from './chat.service.js';

const matchId = (req: Request) => parseInput(uuidParamSchema, req.params.matchId);

/**
 * `/api/v1/chats` — REST side of chat (history, list, unread count) and the fallback for
 * sending/reading when the socket is disconnected. Same service, same rules as Socket.IO.
 * Active, onboarded members only: suspended accounts can't chat.
 */
export function createChatRouter(deps: {
  service: ChatService;
  authenticateMember: RequestHandler;
  limiter: RequestHandler;
}): Router {
  const { service, authenticateMember, limiter } = deps;
  const router = Router();
  router.use(authenticateMember, requireActiveMember, (_req, res, next) => {
    res.setHeader('Cache-Control', 'private, no-store');
    next();
  });

  router.get('/', async (req, res) => {
    const cursor =
      typeof req.query.cursor === 'string' ? req.query.cursor.slice(0, 200) : undefined;
    const { items, meta } = await service.list(memberAuth(req).userId, cursor);
    okPaginated(res, items, meta);
  });

  router.get('/unread', async (req, res) => {
    ok(res, { total: await service.unreadTotal(memberAuth(req).userId) });
  });

  router.get('/:matchId', async (req, res) => {
    ok(res, await service.get(memberAuth(req).userId, matchId(req)));
  });

  router.get('/:matchId/messages', async (req, res) => {
    const query = parseInput(messageListQuerySchema, req.query);
    const { items, meta } = await service.messages(memberAuth(req).userId, matchId(req), query);
    okPaginated(res, items, meta);
  });

  router.post('/:matchId/messages', async (req, res) => {
    const input = parseInput(sendMessageSchema, req.body);
    const { message, created } = await service.send(memberAuth(req).userId, matchId(req), input);
    ok(res, message, created ? 'Message sent' : 'Message already sent', created ? 201 : 200);
  });

  router.post('/:matchId/read', limiter, async (req, res) => {
    const { lastReadMessageId } = parseInput(markReadSchema, req.body);
    ok(res, await service.markRead(memberAuth(req).userId, matchId(req), lastReadMessageId));
  });

  return router;
}
