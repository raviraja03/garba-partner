import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type InfiniteData,
  type QueryClient,
} from '@tanstack/react-query';
import { useSyncExternalStore } from 'react';
import type { MessageDto } from '@garba-partner/shared';
import { fetchChat, fetchChats, fetchMessages, fetchUnread, type Page } from './chat-api';
import {
  isChatConnected,
  markChatRead,
  sendChatMessage,
  subscribeChatConnection,
} from './chat-socket';

export const chatKeys = {
  all: ['chats'] as const,
  list: ['chats', 'list'] as const,
  unread: ['chats', 'unread'] as const,
  chat: (matchId: string) => ['chats', 'chat', matchId] as const,
  messages: (matchId: string) => ['chats', 'messages', matchId] as const,
};

export function useChatConnected(): boolean {
  return useSyncExternalStore(subscribeChatConnection, isChatConnected, () => false);
}

export function useChats() {
  return useInfiniteQuery({
    queryKey: chatKeys.list,
    queryFn: ({ pageParam }) => fetchChats(pageParam),
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.nextCursor,
  });
}

export function useChat(matchId: string) {
  return useQuery({ queryKey: chatKeys.chat(matchId), queryFn: () => fetchChat(matchId) });
}

/** Total unread messages (navigation badge). Kept fresh by socket events. */
export function useUnreadCount(enabled = true) {
  return useQuery({
    queryKey: chatKeys.unread,
    queryFn: fetchUnread,
    select: (data) => data.total,
    refetchInterval: 60_000,
    enabled,
  });
}

export function useMessages(matchId: string) {
  return useInfiniteQuery({
    queryKey: chatKeys.messages(matchId),
    queryFn: ({ pageParam }) => fetchMessages(matchId, pageParam),
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.nextCursor,
    // New messages arrive over the socket; no need to refetch on focus.
    refetchOnWindowFocus: false,
  });
}

/** Inserts a message into a loaded conversation (newest-first pages), without duplicates. */
export function addMessageToCache(queryClient: QueryClient, message: MessageDto): void {
  queryClient.setQueryData<InfiniteData<Page<MessageDto>, string | null>>(
    chatKeys.messages(message.matchId),
    (data) => {
      if (!data) return data;
      if (data.pages.some((p) => p.items.some((m) => m.id === message.id))) return data;
      const [first, ...rest] = data.pages;
      if (!first) return data;
      return { ...data, pages: [{ ...first, items: [message, ...first.items] }, ...rest] };
    },
  );
}

export function useSendMessage(matchId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: string) => sendChatMessage(matchId, body),
    onSuccess: async (message) => {
      addMessageToCache(queryClient, message);
      await queryClient.invalidateQueries({ queryKey: chatKeys.list });
    },
  });
}

export function useMarkRead(matchId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (lastReadMessageId: string) => markChatRead(matchId, lastReadMessageId),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: chatKeys.unread }),
        queryClient.invalidateQueries({ queryKey: chatKeys.list }),
      ]);
    },
  });
}
