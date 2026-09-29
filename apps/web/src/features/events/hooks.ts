import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { fetchEvent, fetchEvents, type EventListParams } from './events-api';

export const eventKeys = {
  list: (params: EventListParams) => ['events', params] as const,
  detail: (idOrSlug: string) => ['event', idOrSlug] as const,
};

export function useEventList(params: EventListParams) {
  return useInfiniteQuery({
    queryKey: eventKeys.list(params),
    queryFn: ({ pageParam }) => fetchEvents(params, pageParam),
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.nextCursor,
  });
}

export function useEvent(idOrSlug: string) {
  return useQuery({ queryKey: eventKeys.detail(idOrSlug), queryFn: () => fetchEvent(idOrSlug) });
}
