import type {
  AdminAuditLogDto,
  ApiSuccess,
  PaginationMeta,
  SafetyEventType,
  SafetyLogDto,
  SafetySeverity,
} from '@garba-partner/shared';
import { api } from '../../lib/api-client';

export interface SafetyLogFilters {
  eventType: SafetyEventType | '';
  severity: SafetySeverity | '';
  userId: string;
}

export interface AuditLogFilters {
  action: string;
  targetId: string;
}

async function page<T>(path: string, params: URLSearchParams, cursor: string | null) {
  params.set('limit', '50');
  if (cursor) params.set('cursor', cursor);
  const envelope = await api<ApiSuccess<T[], PaginationMeta>>(`${path}?${params.toString()}`, {
    authenticated: true,
    envelope: true,
  });
  return { items: envelope.data, nextCursor: envelope.meta?.nextCursor ?? null };
}

/** `safety_logs:view`. Never includes IP hashes, message text or phone numbers. */
export function fetchSafetyLogs(filters: SafetyLogFilters, cursor: string | null) {
  const params = new URLSearchParams();
  if (filters.eventType) params.set('eventType', filters.eventType);
  if (filters.severity) params.set('severity', filters.severity);
  if (filters.userId.trim()) params.set('userId', filters.userId.trim());
  return page<SafetyLogDto>('/admin/safety-logs', params, cursor);
}

/** `audit:view` (super admins). */
export function fetchAuditLogs(filters: AuditLogFilters, cursor: string | null) {
  const params = new URLSearchParams();
  if (filters.action.trim()) params.set('action', filters.action.trim());
  if (filters.targetId.trim()) params.set('targetId', filters.targetId.trim());
  return page<AdminAuditLogDto>('/admin/audit-logs', params, cursor);
}
