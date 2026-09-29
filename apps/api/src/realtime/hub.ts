import type { Server } from 'socket.io';
import {
  LIMITS,
  type ClientToServerEvents,
  type ServerToClientEvents,
} from '@garba-partner/shared';
import { createSlidingWindowLimiter, type SlidingWindowLimiter } from '../lib/sliding-window.js';

export type RealtimeServer = Server<ClientToServerEvents, ServerToClientEvents>;

/** Every member's sockets join this room, so emits never depend on socket IDs. */
export const userRoom = (userId: string) => `user:${userId}`;

/**
 * The seam between business services and Socket.IO (docs/chat/architecture.md#realtime-hub).
 * Services call `toUser` / `disconnectUser` AFTER their transaction commits; until a Socket.IO
 * server is attached (tests, scripts) these are no-ops, so services never depend on sockets.
 */
export interface RealtimeHub {
  attach(io: RealtimeServer): void;
  toUser<E extends keyof ServerToClientEvents>(
    userId: string,
    event: E,
    ...args: Parameters<ServerToClientEvents[E]>
  ): void;
  /** Tells the member why, then closes all their sockets (sanctions, deletion). */
  disconnectUser(userId: string, reason: 'account_restricted' | 'session_revoked'): void;
  /** Message rate limit shared by REST and socket sends. */
  readonly messageLimiter: SlidingWindowLimiter;
}

export function createRealtimeHub(): RealtimeHub {
  let io: RealtimeServer | null = null;
  return {
    attach(server) {
      io = server;
    },
    toUser(userId, event, ...args) {
      io?.to(userRoom(userId)).emit(event, ...args);
    },
    disconnectUser(userId, reason) {
      if (!io) return;
      io.to(userRoom(userId)).emit('session:ended', { reason });
      io.in(userRoom(userId)).disconnectSockets(true);
    },
    messageLimiter: createSlidingWindowLimiter({
      limit: LIMITS.MESSAGES_PER_MINUTE,
      windowMs: 60 * 1000,
    }),
  };
}
