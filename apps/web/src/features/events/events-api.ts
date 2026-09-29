import type {
  ApiSuccess,
  EventCardDto,
  EventDetailDto,
  EventSort,
  PaginationMeta,
} from '@garba-partner/shared';
import { api } from '../../lib/api-client';

/** Query sent to `GET /events` (dates are IST calendar days). */
export interface EventListParams {
  cityId: string | null;
  from: string | null;
  to: string | null;
  sort: EventSort;
}

export interface EventListPage {
  items: EventCardDto[];
  nextCursor: string | null;
}

export const EVENTS_PAGE_SIZE = 12;

export async function fetchEvents(
  params: EventListParams,
  cursor: string | null,
): Promise<EventListPage> {
  const search = new URLSearchParams();
  if (params.cityId) search.set('cityId', params.cityId);
  if (params.from) search.set('from', params.from);
  if (params.to) search.set('to', params.to);
  search.set('sort', params.sort);
  search.set('limit', String(EVENTS_PAGE_SIZE));
  if (cursor) search.set('cursor', cursor);
  // Public endpoint: no access token is sent.
  const envelope = await api<ApiSuccess<EventCardDto[], PaginationMeta>>(
    `/events?${search.toString()}`,
    { envelope: true },
  );
  return { items: envelope.data, nextCursor: envelope.meta?.nextCursor ?? null };
}

export const fetchEvent = (idOrSlug: string) =>
  api<EventDetailDto>(`/events/${encodeURIComponent(idOrSlug)}`);
