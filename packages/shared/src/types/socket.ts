import type { ErrorCode } from '../errors/error-codes.js';
import type { MessageDto } from './dto/chat.dto.js';
import type { NotificationDto } from './dto/notification.dto.js';

/**
 * Socket.IO contract (docs/chat/socket-events.md). Typed on both ends:
 * `Server<ClientToServerEvents, ServerToClientEvents>` and
 * `Socket<ServerToClientEvents, ClientToServerEvents>`.
 */

/** Every client → server event is acknowledged with this shape. */
export type SocketAck<TData> =
  { ok: true; data: TData } | { ok: false; error: { code: ErrorCode; message: string } };

export interface ClientToServerEvents {
  'message:send': (
    payload: { matchId: string; clientMessageId: string; body: string },
    ack: (result: SocketAck<MessageDto>) => void,
  ) => void;
  'message:read': (
    payload: { matchId: string; lastReadMessageId: string },
    ack: (result: SocketAck<{ lastReadAt: string }>) => void,
  ) => void;
}

export interface ServerToClientEvents {
  /** To both members (the sender's other tabs included). */
  'message:new': (message: MessageDto) => void;
  /** To the OTHER member when someone reads up to a point. */
  'message:read': (payload: { matchId: string; userId: string; lastReadAt: string }) => void;
  /** To both members when a match ends. No reason is given. */
  'match:ended': (payload: { matchId: string }) => void;
  /** Just before the server disconnects a member (sanction, session end). */
  'session:ended': (payload: { reason: 'account_restricted' | 'session_revoked' }) => void;
  /** A new (or updated, for collapsed chat messages) notification and the new unread total. */
  'notification:new': (payload: { notification: NotificationDto; unreadCount: number }) => void;
}

/** Errors a client receives in `connect_error` (`error.message` is the code). */
export const SOCKET_CONNECT_ERRORS = [
  'UNAUTHENTICATED',
  'ACCOUNT_SUSPENDED',
  'ACCOUNT_BANNED',
  'ONBOARDING_REQUIRED',
] as const satisfies readonly ErrorCode[];
export type SocketConnectError = (typeof SOCKET_CONNECT_ERRORS)[number];
