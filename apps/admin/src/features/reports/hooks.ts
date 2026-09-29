import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AdminResolveReportInput } from '@garba-partner/shared';
import {
  fetchConversation,
  fetchReport,
  fetchReports,
  resolveReport,
  type ReportFilters,
} from './reports-api';

export const reportKeys = {
  all: ['admin', 'reports'] as const,
  list: (filters: ReportFilters) => ['admin', 'reports', 'list', filters] as const,
  detail: (id: string) => ['admin', 'reports', 'detail', id] as const,
};

export function useReportList(filters: ReportFilters) {
  return useInfiniteQuery({
    queryKey: reportKeys.list(filters),
    queryFn: ({ pageParam }) => fetchReports(filters, pageParam),
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.nextCursor,
    refetchInterval: 30_000,
  });
}

export function useReport(reportId: string) {
  return useQuery({ queryKey: reportKeys.detail(reportId), queryFn: () => fetchReport(reportId) });
}

/**
 * Opening a conversation is a deliberate, audited action: a mutation (never cached or
 * refetched automatically).
 */
export function useOpenConversation(reportId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => fetchConversation(reportId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: reportKeys.all });
    },
  });
}

export function useResolveReport(reportId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: AdminResolveReportInput) => resolveReport(reportId, input),
    onSuccess: async (report) => {
      queryClient.setQueryData(reportKeys.detail(reportId), report);
      await queryClient.invalidateQueries({ queryKey: reportKeys.all });
    },
  });
}
