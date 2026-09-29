import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  fetchOrganizer,
  fetchOrganizerOptions,
  fetchOrganizers,
  runOrganizerAction,
  type OrganizerAction,
  type OrganizerListFilters,
} from './organizers-api';

export const organizerKeys = {
  all: ['admin', 'organizers'] as const,
  list: (filters: OrganizerListFilters) => ['admin', 'organizers', 'list', filters] as const,
  options: ['admin', 'organizers', 'options'] as const,
  detail: (organizerId: string) => ['admin', 'organizer', organizerId] as const,
};

export function useOrganizerList(filters: OrganizerListFilters) {
  return useInfiniteQuery({
    queryKey: organizerKeys.list(filters),
    queryFn: ({ pageParam }) => fetchOrganizers(filters, pageParam),
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.nextCursor,
  });
}

export function useOrganizerOptions() {
  return useQuery({ queryKey: organizerKeys.options, queryFn: fetchOrganizerOptions });
}

export function useOrganizer(organizerId: string) {
  return useQuery({
    queryKey: organizerKeys.detail(organizerId),
    queryFn: () => fetchOrganizer(organizerId),
  });
}

export function useOrganizerAction(organizerId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (action: OrganizerAction) => runOrganizerAction(organizerId, action),
    onSuccess: async (organizer) => {
      queryClient.setQueryData(organizerKeys.detail(organizerId), organizer);
      await queryClient.invalidateQueries({ queryKey: organizerKeys.all });
    },
  });
}
