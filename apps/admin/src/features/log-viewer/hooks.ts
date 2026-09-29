import { useInfiniteQuery } from '@tanstack/react-query';
import {
  fetchAuditLogs,
  fetchSafetyLogs,
  type AuditLogFilters,
  type SafetyLogFilters,
} from './logs-api';

export function useSafetyLogs(filters: SafetyLogFilters) {
  return useInfiniteQuery({
    queryKey: ['admin', 'safety-logs', filters],
    queryFn: ({ pageParam }) => fetchSafetyLogs(filters, pageParam),
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.nextCursor,
  });
}

export function useAuditLogs(filters: AuditLogFilters) {
  return useInfiniteQuery({
    queryKey: ['admin', 'audit-logs', filters],
    queryFn: ({ pageParam }) => fetchAuditLogs(filters, pageParam),
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.nextCursor,
  });
}
