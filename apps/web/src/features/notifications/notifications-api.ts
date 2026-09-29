import type {
  ApiSuccess,
  NotificationDto,
  NotificationPreferencesDto,
  NotificationUnreadCountDto,
  PaginationMeta,
  UpdateNotificationPreferencesInput,
} from '@garba-partner/shared';
import { api } from '../../lib/api-client';

export async function fetchNotifications(cursor: string | null, unreadOnly: boolean) {
  const params = new URLSearchParams({ limit: '20' });
  if (cursor) params.set('cursor', cursor);
  if (unreadOnly) params.set('unread', 'true');
  const envelope = await api<ApiSuccess<NotificationDto[], PaginationMeta>>(
    `/notifications?${params.toString()}`,
    { authenticated: true, envelope: true },
  );
  return { items: envelope.data, nextCursor: envelope.meta?.nextCursor ?? null };
}

export const fetchNotificationUnread = () =>
  api<NotificationUnreadCountDto>('/notifications/unread-count', { authenticated: true });

export const markNotificationRead = (id: string) =>
  api<NotificationDto>(`/notifications/${id}/read`, { method: 'POST', authenticated: true });

export const markAllNotificationsRead = () =>
  api<{ updated: number }>('/notifications/read-all', { method: 'POST', authenticated: true });

export const fetchNotificationPreferences = () =>
  api<NotificationPreferencesDto>('/notifications/preferences', { authenticated: true });

export const updateNotificationPreferences = (input: UpdateNotificationPreferencesInput) =>
  api<NotificationPreferencesDto>('/notifications/preferences', {
    method: 'PUT',
    body: input,
    authenticated: true,
  });
