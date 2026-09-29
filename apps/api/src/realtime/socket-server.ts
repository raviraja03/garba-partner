import type { Server as HttpServer } from 'node:http';
import type { Logger } from 'pino';
import { Server, type Socket } from 'socket.io';
import type { ServerEnv } from '@garba-partner/config/server';
import {
  LIMITS,
  socketMarkReadSchema,
  socketSendMessageSchema,
  type ClientToServerEvents,
  type ErrorCode,
  type ServerToClientEvents,
  type SocketAck,
  type SocketConnectError,
} from '@garba-partner/shared';
import { AppError } from '../lib/app-error.js';
import { createSlidingWindowLimiter } from '../lib/sliding-window.js';
import { parseInput } from '../lib/validation.js';
import { isMemberSessionActive, resolveMemberSession } from '../middlewares/authenticate.js';
import type { TokenService } from '../modules/auth/token.service.js';
import type { ChatService } from '../modules/chat/chat.service.js';
import { userRoom, type RealtimeHub, type RealtimeServer } from './hub.js';

interface SocketData {
  userId: string;
  sessionId: string;
}

type ChatSocket = Socket<
  ClientToServerEvents,
  ServerToClientEvents,
  Record<string, never>,
  SocketData
>;

/** Path of the Socket.IO endpoint (proxied like `/api` in development and by Nginx). */
export const SOCKET_PATH = '/socket.io';

function connectError(code: SocketConnectError): Error {
  return new Error(code);
}

/**
 * Socket.IO server (docs/chat/architecture.md, docs/chat/socket-events.md).
 *
 * - Handshake: `auth.token` is a member access token, verified exactly like HTTP requests
 *   (JWT + session + account). Only ACTIVE, onboarded members can connect.
 * - Each socket joins `user:{id}`; services emit through the RealtimeHub after commit.
 * - EVERY event re-checks the session and account (logout, suspension and bans apply
 *   immediately), validates its payload and is rate-limited, then calls the same ChatService
 *   as REST — which re-checks the match, membership, partner status and blocks.
 * - A socket is disconnected when its access token expires; the client refreshes and reconnects.
 */
export function attachSocketServer(
  httpServer: HttpServer,
  deps: {
    env: Pick<ServerEnv, 'WEB_ORIGIN'>;
    logger: Logger;
    tokens: TokenService;
    chat: ChatService;
    hub: RealtimeHub;
  },
): RealtimeServer {
  const { env, logger, tokens, chat, hub } = deps;
  const io: RealtimeServer = new Server<
    ClientToServerEvents,
    ServerToClientEvents,
    Record<string, never>,
    SocketData
  >(httpServer, {
    path: SOCKET_PATH,
    serveClient: false,
    cors: { origin: [env.WEB_ORIGIN], credentials: true },
    maxHttpBufferSize: LIMITS.SOCKET_MAX_PAYLOAD_BYTES,
  });

  io.use((socket: ChatSocket, next) => {
    const auth: unknown = socket.handshake.auth;
    const token =
      typeof auth === 'object' && auth !== null ? (auth as { token?: unknown }).token : undefined;
    if (typeof token !== 'string' || token.length === 0 || token.length > 2048) {
      next(connectError('UNAUTHENTICATED'));
      return;
    }
    resolveMemberSession(tokens, token)
      .then((session) => {
        if (!session) return next(connectError('UNAUTHENTICATED'));
        if (session.status === 'suspended') return next(connectError('ACCOUNT_SUSPENDED'));
        if (session.status !== 'active') return next(connectError('UNAUTHENTICATED'));
        if (!session.onboarded) return next(connectError('ONBOARDING_REQUIRED'));
        socket.data.userId = session.userId;
        socket.data.sessionId = session.sessionId;
        // End the connection when the access token expires (the client refreshes and reconnects).
        const timer = setTimeout(
          () => socket.disconnect(true),
          Math.max(0, session.expiresAt.getTime() - Date.now()),
        );
        socket.once('disconnect', () => {
          clearTimeout(timer);
        });
        next();
      })
      .catch((error: unknown) => {
        next(
          connectError(
            error instanceof AppError && error.code === 'ACCOUNT_BANNED'
              ? 'ACCOUNT_BANNED'
              : 'UNAUTHENTICATED',
          ),
        );
      });
  });

  io.on('connection', (socket: ChatSocket) => {
    const { userId, sessionId } = socket.data;
    void socket.join(userRoom(userId));
    const limiter = createSlidingWindowLimiter({
      limit: LIMITS.SOCKET_EVENTS_PER_MINUTE,
      windowMs: 60 * 1000,
    });

    /** Common wrapper: ack contract, rate limit, live session check, error mapping. */
    function handle<T>(ack: unknown, run: () => Promise<T>): void {
      if (typeof ack !== 'function') return; // Every event must be acknowledged.
      const reply = ack as (result: SocketAck<T>) => void;
      const fail = (code: ErrorCode, message: string) => {
        reply({ ok: false, error: { code, message } });
      };
      if (!limiter.take(socket.id)) {
        fail('RATE_LIMITED', 'Too many requests. Please slow down.');
        return;
      }
      isMemberSessionActive(userId, sessionId)
        .then(async (active) => {
          if (!active) {
            fail('UNAUTHENTICATED', 'Please log in again.');
            socket.emit('session:ended', { reason: 'session_revoked' });
            socket.disconnect(true);
            return;
          }
          reply({ ok: true, data: await run() });
        })
        .catch((error: unknown) => {
          if (error instanceof AppError) {
            // Validation failures carry the first field message (e.g. "Message is empty.").
            fail(error.code, error.details?.[0]?.message ?? error.message);
            return;
          }
          logger.error({ err: error, userId }, 'Socket event failed');
          fail('INTERNAL_ERROR', 'Something went wrong. Please try again.');
        });
    }

    socket.on('message:send', (payload, ack) => {
      handle(ack, async () => {
        const input = parseInput(socketSendMessageSchema, payload);
        const { message } = await chat.send(userId, input.matchId, {
          clientMessageId: input.clientMessageId,
          body: input.body,
        });
        return message;
      });
    });

    socket.on('message:read', (payload, ack) => {
      handle(ack, async () => {
        const input = parseInput(socketMarkReadSchema, payload);
        return chat.markRead(userId, input.matchId, input.lastReadMessageId);
      });
    });
  });

  hub.attach(io);
  return io;
}
