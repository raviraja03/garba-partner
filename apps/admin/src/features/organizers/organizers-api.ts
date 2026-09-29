import type {
  AdminOrganizerDto,
  AdminOrganizerListItemDto,
  ApiSuccess,
  CreateOrganizerInput,
  OrganizerOptionDto,
  OrganizerStatus,
  PaginationMeta,
  UpdateOrganizerInput,
} from '@garba-partner/shared';
import { api } from '../../lib/api-client';

export interface OrganizerListFilters {
  q: string;
  status: OrganizerStatus | '';
  verified: '' | 'true' | 'false';
}

export interface OrganizerListPage {
  items: AdminOrganizerListItemDto[];
  nextCursor: string | null;
}

export type OrganizerAction = 'verify' | 'unverify' | 'archive' | 'restore';

export async function fetchOrganizers(
  filters: OrganizerListFilters,
  cursor: string | null,
): Promise<OrganizerListPage> {
  const params = new URLSearchParams();
  if (filters.q.trim()) params.set('q', filters.q.trim());
  if (filters.status) params.set('status', filters.status);
  if (filters.verified) params.set('verified', filters.verified);
  params.set('limit', '20');
  if (cursor) params.set('cursor', cursor);
  const envelope = await api<ApiSuccess<AdminOrganizerListItemDto[], PaginationMeta>>(
    `/admin/organizers?${params.toString()}`,
    { authenticated: true, envelope: true },
  );
  return { items: envelope.data, nextCursor: envelope.meta?.nextCursor ?? null };
}

export const fetchOrganizerOptions = () =>
  api<OrganizerOptionDto[]>('/admin/organizers/options', { authenticated: true });

export const fetchOrganizer = (organizerId: string) =>
  api<AdminOrganizerDto>(`/admin/organizers/${organizerId}`, { authenticated: true });

export const createOrganizer = (input: CreateOrganizerInput) =>
  api<AdminOrganizerDto>('/admin/organizers', {
    method: 'POST',
    body: input,
    authenticated: true,
  });

export const updateOrganizer = (organizerId: string, input: UpdateOrganizerInput) =>
  api<AdminOrganizerDto>(`/admin/organizers/${organizerId}`, {
    method: 'PATCH',
    body: input,
    authenticated: true,
  });

export const runOrganizerAction = (organizerId: string, action: OrganizerAction) =>
  api<AdminOrganizerDto>(`/admin/organizers/${organizerId}/${action}`, {
    method: 'POST',
    authenticated: true,
  });
