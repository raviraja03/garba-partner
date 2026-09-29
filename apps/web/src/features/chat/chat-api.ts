import type {
  ApiSuccess,
  ChatSummaryDto,
  MessageDto,
  PaginationMeta,
  UnreadCountDto,
} from '@garba-partner/shared';
import { api } from '../../lib/api-client';

export interface Page<T> {
  items: T[];
  nextCursor: string | null;
}

async function page<T>(path: string, cursor: string | null, limit?: number): Promise<Page<T>> {
  const params = new URLSearchParams();
  if (cursor) params.set('cursor', cursor);
  if (limit) params.set('limit', String(limit));
  const query = params.toString();
  const envelope = await api<ApiSuccess<T[], PaginationMeta>>(
    `${path}${query ? `?${query}` : ''}`,
    {
      authenticated: true,
      envelope: true,
    },
  );
  return { items: envelope.data, nextCursor: envelope.meta?.nextCursor ?? null };
}

export const fetchChats = (cursor: string | null) => page<ChatSummaryDto>('/chats', cursor);

export const fetchChat = (matchId: string) =>
  api<ChatSummaryDto>(`/chats/${matchId}`, { authenticated: true });

export const fetchUnread = () => api<UnreadCountDto>('/chats/unread', { authenticated: true });

/** Newest first; `cursor` loads older messages. */
export const fetchMessages = (matchId: string, cursor: string | null) =>
  page<MessageDto>(`/chats/${matchId}/messages`, cursor, 30);

/** REST fallback when the socket is disconnected (same idempotency key). */
export const sendMessageRest = (matchId: string, clientMessageId: string, body: string) =>
  api<MessageDto>(`/chats/${matchId}/messages`, {
    method: 'POST',
    body: { clientMessageId, body },
    authenticated: true,
  });

export const markReadRest = (matchId: string, lastReadMessageId: string) =>
  api<{ lastReadAt: string }>(`/chats/${matchId}/read`, {
    method: 'POST',
    body: { lastReadMessageId },
    authenticated: true,
  });
