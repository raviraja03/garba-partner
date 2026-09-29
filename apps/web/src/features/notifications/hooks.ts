import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  fetchNotificationPreferences,
  fetchNotifications,
  fetchNotificationUnread,
  markAllNotificationsRead,
  markNotificationRead,
  updateNotificationPreferences,
} from './notifications-api';

export const notificationKeys = {
  all: ['notifications'] as const,
  list: (unreadOnly: boolean) => ['notifications', 'list', unreadOnly] as const,
  unread: ['notifications', 'unread'] as const,
  preferences: ['notifications', 'preferences'] as const,
};

export function useNotifications(unreadOnly: boolean) {
  return useInfiniteQuery({
    queryKey: notificationKeys.list(unreadOnly),
    queryFn: ({ pageParam }) => fetchNotifications(pageParam, unreadOnly),
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.nextCursor,
  });
}

/** Unread total for the bell. Live via `notification:new`; polled as a fallback (suspended members have no socket). */
export function useNotificationUnread(enabled: boolean) {
  return useQuery({
    queryKey: notificationKeys.unread,
    queryFn: fetchNotificationUnread,
    select: (data) => data.unread,
    refetchInterval: 60_000,
    enabled,
  });
}

function useInvalidatingMutation<TInput, TResult>(fn: (input: TInput) => Promise<TResult>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: notificationKeys.all }),
  });
}

export const useMarkNotificationRead = () => useInvalidatingMutation(markNotificationRead);
export const useMarkAllNotificationsRead = () =>
  useInvalidatingMutation(() => markAllNotificationsRead());

export function useNotificationPreferences() {
  return useQuery({
    queryKey: notificationKeys.preferences,
    queryFn: fetchNotificationPreferences,
  });
}

export function useUpdateNotificationPreferences() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: updateNotificationPreferences,
    onSuccess: (preferences) => {
      queryClient.setQueryData(notificationKeys.preferences, preferences);
    },
  });
}
