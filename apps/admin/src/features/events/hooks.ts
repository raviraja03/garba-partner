import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AdminEventDetailDto } from '@garba-partner/shared';
import {
  deleteEvent,
  deleteEventImage,
  fetchAreas,
  fetchCities,
  fetchEvent,
  fetchEvents,
  runEventAction,
  uploadEventImage,
  type EventAction,
  type EventListFilters,
} from './events-api';

export const eventKeys = {
  all: ['admin', 'events'] as const,
  list: (filters: EventListFilters) => ['admin', 'events', filters] as const,
  detail: (eventId: string) => ['admin', 'event', eventId] as const,
  cities: ['cities'] as const,
  areas: (cityId: string) => ['cities', cityId, 'areas'] as const,
};

export function useEventList(filters: EventListFilters) {
  return useInfiniteQuery({
    queryKey: eventKeys.list(filters),
    queryFn: ({ pageParam }) => fetchEvents(filters, pageParam),
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.nextCursor,
  });
}

export function useEvent(eventId: string) {
  return useQuery({ queryKey: eventKeys.detail(eventId), queryFn: () => fetchEvent(eventId) });
}

export function useCities() {
  return useQuery({ queryKey: eventKeys.cities, queryFn: fetchCities, staleTime: 10 * 60_000 });
}

export function useAreas(cityId: string) {
  return useQuery({
    queryKey: eventKeys.areas(cityId),
    queryFn: () => fetchAreas(cityId),
    enabled: cityId !== '',
    staleTime: 10 * 60_000,
  });
}

/** Caches the returned event and refreshes lists after any change. */
export function useEventMutation<TArg>(
  eventId: string,
  mutationFn: (arg: TArg) => Promise<AdminEventDetailDto>,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: async (event) => {
      queryClient.setQueryData(eventKeys.detail(eventId), event);
      await queryClient.invalidateQueries({ queryKey: eventKeys.all });
    },
  });
}

export const useEventAction = (eventId: string) =>
  useEventMutation(eventId, (action: EventAction) => runEventAction(eventId, action));

export const useEventImageUpload = (eventId: string) =>
  useEventMutation(eventId, (file: File) => uploadEventImage(eventId, file));

export const useEventImageDelete = (eventId: string) =>
  useEventMutation(eventId, () => deleteEventImage(eventId));

export function useDeleteEvent(eventId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => deleteEvent(eventId),
    onSuccess: async () => {
      queryClient.removeQueries({ queryKey: eventKeys.detail(eventId) });
      await queryClient.invalidateQueries({ queryKey: eventKeys.all });
    },
  });
}
