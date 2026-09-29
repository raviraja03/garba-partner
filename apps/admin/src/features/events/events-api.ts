import type {
  AdminEventDetailDto,
  AdminEventListItemDto,
  AdminEventSort,
  ApiSuccess,
  AreaDto,
  CityDto,
  CreateEventInput,
  EventStatus,
  PaginationMeta,
  UpdateEventInput,
} from '@garba-partner/shared';
import { api } from '../../lib/api-client';

export interface EventListFilters {
  q: string;
  status: EventStatus | '';
  cityId: string;
  verified: '' | 'true' | 'false';
  sort: AdminEventSort;
}

export interface EventListPage {
  items: AdminEventListItemDto[];
  nextCursor: string | null;
}

export type EventAction = 'publish' | 'unpublish' | 'verify' | 'unverify' | 'archive' | 'restore';

export async function fetchEvents(
  filters: EventListFilters,
  cursor: string | null,
): Promise<EventListPage> {
  const params = new URLSearchParams();
  if (filters.q.trim()) params.set('q', filters.q.trim());
  if (filters.status) params.set('status', filters.status);
  if (filters.cityId) params.set('cityId', filters.cityId);
  if (filters.verified) params.set('verified', filters.verified);
  params.set('sort', filters.sort);
  params.set('limit', '20');
  if (cursor) params.set('cursor', cursor);
  const envelope = await api<ApiSuccess<AdminEventListItemDto[], PaginationMeta>>(
    `/admin/events?${params.toString()}`,
    { authenticated: true, envelope: true },
  );
  return { items: envelope.data, nextCursor: envelope.meta?.nextCursor ?? null };
}

export const fetchEvent = (eventId: string) =>
  api<AdminEventDetailDto>(`/admin/events/${eventId}`, { authenticated: true });

export const createEvent = (input: CreateEventInput) =>
  api<AdminEventDetailDto>('/admin/events', { method: 'POST', body: input, authenticated: true });

export const updateEvent = (eventId: string, input: UpdateEventInput) =>
  api<AdminEventDetailDto>(`/admin/events/${eventId}`, {
    method: 'PATCH',
    body: input,
    authenticated: true,
  });

export const runEventAction = (eventId: string, action: EventAction) =>
  api<AdminEventDetailDto>(`/admin/events/${eventId}/${action}`, {
    method: 'POST',
    authenticated: true,
  });

export const deleteEvent = (eventId: string) =>
  api<{ id: string; deleted: true }>(`/admin/events/${eventId}`, {
    method: 'DELETE',
    authenticated: true,
  });

export function uploadEventImage(eventId: string, file: File) {
  const formData = new FormData();
  formData.append('image', file);
  return api<AdminEventDetailDto>(`/admin/events/${eventId}/image`, {
    method: 'POST',
    formData,
    authenticated: true,
  });
}

export const deleteEventImage = (eventId: string) =>
  api<AdminEventDetailDto>(`/admin/events/${eventId}/image`, {
    method: 'DELETE',
    authenticated: true,
  });

/** Active cities/areas come from the public location endpoints. */
export const fetchCities = () => api<CityDto[]>('/cities');
export const fetchAreas = (cityId: string) => api<AreaDto[]>(`/cities/${cityId}/areas`);
