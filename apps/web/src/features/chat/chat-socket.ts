import { io, type Socket } from 'socket.io-client';
import type {
  ClientToServerEvents,
  MessageDto,
  ServerToClientEvents,
  SocketAck,
  NotificationDto,
} from '@garba-partner/shared';
import { ApiClientError, getAccessToken, refreshSession } from '../../lib/api-client';
import { markReadRest, sendMessageRest } from './chat-api';

type ChatSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

export interface ChatSocketHandlers {
  onMessage: (message: MessageDto) => void;
  onRead: (payload: { matchId: string; userId: string; lastReadAt: string }) => void;
  onMatchEnded: (payload: { matchId: string }) => void;
  /** A new notification (and the unread total). */
  onNotification: (payload: { notification: NotificationDto; unreadCount: number }) => void;
  /** The server ended this member's session (sanction or logout elsewhere). */
  onSessionEnded: () => void;
}

const ACK_TIMEOUT_MS = 8000;

/**
 * One Socket.IO connection per signed-in tab (docs/chat/architecture.md#web-client). Lives
 * outside React; components read the connection state with `useChatConnected()`.
 *
 * - The handshake sends the in-memory access token (never stored anywhere else).
 * - When the server refuses or drops the connection because the token expired, the client
 *   refreshes the session over HTTP and reconnects.
 * - Sending and read receipts go over the socket when connected, otherwise over REST with the
 *   same idempotency key, so a retry never duplicates a message.
 */
let socket: ChatSocket | null = null;
const listeners = new Set<() => void>();
const notify = () => {
  for (const listener of listeners) listener();
};

export function subscribeChatConnection(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function isChatConnected(): boolean {
  return socket?.connected ?? false;
}

export function startChatSocket(handlers: ChatSocketHandlers): () => void {
  let sessionEnded = false;
  let refreshing = false;
  const client: ChatSocket = io({
    path: '/socket.io',
    // Function form: every (re)connection uses the latest access token.
    auth: (cb) => {
      cb({ token: getAccessToken() ?? '' });
    },
    reconnectionDelayMax: 10_000,
  });

  const refreshAndReconnect = () => {
    if (refreshing || sessionEnded) return;
    refreshing = true;
    refreshSession()
      .then(() => {
        client.connect();
      })
      .catch(() => {
        // The HTTP layer signs the member out when refresh fails.
      })
      .finally(() => {
        refreshing = false;
      });
  };

  client.on('connect', notify);
  client.on('disconnect', (reason) => {
    notify();
    // The server closes sockets when the access token expires: refresh, then reconnect.
    if (reason === 'io server disconnect') refreshAndReconnect();
  });
  client.on('connect_error', (error) => {
    notify();
    if (error.message === 'UNAUTHENTICATED') refreshAndReconnect();
  });
  client.on('message:new', handlers.onMessage);
  client.on('message:read', handlers.onRead);
  client.on('match:ended', handlers.onMatchEnded);
  client.on('notification:new', handlers.onNotification);
  client.on('session:ended', () => {
    sessionEnded = true;
    handlers.onSessionEnded();
  });

  socket = client;
  notify();
  return () => {
    client.removeAllListeners();
    client.disconnect();
    if (socket === client) socket = null;
    notify();
  };
}

function unwrap<T>(ack: SocketAck<T>): T {
  if (ack.ok) return ack.data;
  throw new ApiClientError(ack.error.message, ack.error.code, 0);
}

/** Sends over the socket when connected, else REST; the same `clientMessageId` either way. */
export async function sendChatMessage(matchId: string, body: string): Promise<MessageDto> {
  const clientMessageId = crypto.randomUUID();
  const client = socket;
  if (client?.connected) {
    try {
      const ack = (await client
        .timeout(ACK_TIMEOUT_MS)
        .emitWithAck('message:send', { matchId, clientMessageId, body })) as SocketAck<MessageDto>;
      return unwrap(ack);
    } catch (error) {
      if (error instanceof ApiClientError) throw error;
      // Ack timed out: fall through to REST with the same idempotency key.
    }
  }
  return sendMessageRest(matchId, clientMessageId, body);
}

export async function markChatRead(matchId: string, lastReadMessageId: string): Promise<void> {
  const client = socket;
  if (client?.connected) {
    const ack = (await client
      .timeout(ACK_TIMEOUT_MS)
      .emitWithAck('message:read', { matchId, lastReadMessageId })
      .catch(() => null)) as SocketAck<{ lastReadAt: string }> | null;
    if (ack?.ok) return;
  }
  await markReadRest(matchId, lastReadMessageId);
}
