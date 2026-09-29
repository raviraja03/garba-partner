import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { SetAttendanceInput } from '@garba-partner/shared';
import {
  blockMember,
  clearAttendance,
  fetchMyAttendance,
  fetchMyEvents,
  fetchPartner,
  fetchPartners,
  reportMember,
  saveAttendance,
  type PartnerFilters,
} from './partners-api';

export const partnerKeys = {
  all: ['partners'] as const,
  list: (filters: PartnerFilters) => ['partners', 'list', filters] as const,
  detail: (userId: string) => ['partners', 'detail', userId] as const,
  attendance: (eventId: string) => ['attendance', eventId] as const,
  myEvents: ['attendance', 'mine'] as const,
};

export function usePartnerList(filters: PartnerFilters, enabled = true) {
  return useInfiniteQuery({
    queryKey: partnerKeys.list(filters),
    queryFn: ({ pageParam }) => fetchPartners(filters, pageParam),
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.nextCursor,
    enabled,
  });
}

export function usePartner(userId: string) {
  return useQuery({ queryKey: partnerKeys.detail(userId), queryFn: () => fetchPartner(userId) });
}

export function useMyAttendance(eventId: string) {
  return useQuery({
    queryKey: partnerKeys.attendance(eventId),
    queryFn: () => fetchMyAttendance(eventId),
  });
}

export function useMyEvents() {
  return useQuery({ queryKey: partnerKeys.myEvents, queryFn: fetchMyEvents });
}

export function useSaveAttendance(eventId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: SetAttendanceInput | null) =>
      input ? saveAttendance(eventId, input) : clearAttendance(eventId),
    onSuccess: async (attendance) => {
      queryClient.setQueryData(partnerKeys.attendance(eventId), attendance);
      await queryClient.invalidateQueries({ queryKey: ['attendance'] });
      await queryClient.invalidateQueries({ queryKey: partnerKeys.all });
    },
  });
}

/** Blocking/reporting removes the member from every list straight away. */
function useSafetyMutation<TInput, TResult>(mutationFn: (input: TInput) => Promise<TResult>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: partnerKeys.all });
    },
  });
}

export const useBlockMember = () => useSafetyMutation(blockMember);
export const useReportMember = () => useSafetyMutation(reportMember);
