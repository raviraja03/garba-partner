import type {
  AdminConversationDto,
  AdminReportDetailDto,
  AdminReportListItemDto,
  AdminResolveReportInput,
  ApiSuccess,
  PaginationMeta,
  ReportStatus,
} from '@garba-partner/shared';
import { api } from '../../lib/api-client';

export interface ReportFilters {
  status: ReportStatus | '';
  priority: '' | '0' | '1' | '2';
}

export async function fetchReports(filters: ReportFilters, cursor: string | null) {
  const params = new URLSearchParams({ limit: '20' });
  if (filters.status) params.set('status', filters.status);
  if (filters.priority) params.set('priority', filters.priority);
  if (cursor) params.set('cursor', cursor);
  const envelope = await api<ApiSuccess<AdminReportListItemDto[], PaginationMeta>>(
    `/admin/reports?${params.toString()}`,
    { authenticated: true, envelope: true },
  );
  return { items: envelope.data, nextCursor: envelope.meta?.nextCursor ?? null };
}

export const fetchReport = (reportId: string) =>
  api<AdminReportDetailDto>(`/admin/reports/${reportId}`, { authenticated: true });

/** Audited: every call is recorded in the admin audit log. */
export const fetchConversation = (reportId: string) =>
  api<AdminConversationDto>(`/admin/reports/${reportId}/conversation`, { authenticated: true });

export const resolveReport = (reportId: string, input: AdminResolveReportInput) =>
  api<AdminReportDetailDto>(`/admin/reports/${reportId}/resolve`, {
    method: 'POST',
    body: input,
    authenticated: true,
  });
