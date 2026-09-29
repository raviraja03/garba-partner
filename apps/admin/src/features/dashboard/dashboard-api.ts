import type {
  AdminDashboardEventRowDto,
  AdminDashboardSummaryDto,
  AdminDashboardTrendsDto,
  ApiSuccess,
  PaginationMeta,
} from '@garba-partner/shared';
import { api, apiDownload } from '../../lib/api-client';

export interface DashboardFilters {
  from: string;
  to: string;
  cityId: string;
}

function params(filters: DashboardFilters, extra: Record<string, string> = {}): string {
  const search = new URLSearchParams({ from: filters.from, to: filters.to, ...extra });
  if (filters.cityId) search.set('cityId', filters.cityId);
  return search.toString();
}

export const fetchDashboardSummary = (filters: DashboardFilters) =>
  api<AdminDashboardSummaryDto>(`/admin/dashboard/summary?${params(filters)}`, {
    authenticated: true,
  });

export const fetchDashboardTrends = (filters: DashboardFilters) =>
  api<AdminDashboardTrendsDto>(`/admin/dashboard/trends?${params(filters)}`, {
    authenticated: true,
  });

export async function fetchDashboardEvents(filters: DashboardFilters, cursor: string | null) {
  const envelope = await api<ApiSuccess<AdminDashboardEventRowDto[], PaginationMeta>>(
    `/admin/dashboard/events?${params(filters, { limit: '20', ...(cursor ? { cursor } : {}) })}`,
    { authenticated: true, envelope: true },
  );
  return { items: envelope.data, nextCursor: envelope.meta?.nextCursor ?? null };
}

/** Per-event sales CSV (audited server-side). Triggers a browser download. */
export async function downloadEventSalesCsv(filters: DashboardFilters): Promise<void> {
  const { blob, filename } = await apiDownload(`/admin/dashboard/events/export?${params(filters)}`);
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename ?? 'event-sales.csv';
  link.click();
  URL.revokeObjectURL(url);
}
