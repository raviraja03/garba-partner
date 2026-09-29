import type {
  AdminMatchDto,
  AdminUserDetailDto,
  AdminUserListItemDto,
  ApiSuccess,
  PaginationMeta,
  UserStatus,
} from '@garba-partner/shared';
import { api } from '../../lib/api-client';

export interface UserListFilters {
  q: string;
  status: UserStatus | '';
}

export interface UserListPage {
  items: AdminUserListItemDto[];
  nextCursor: string | null;
}

export async function fetchUsers(
  filters: UserListFilters,
  cursor: string | null,
): Promise<UserListPage> {
  const params = new URLSearchParams();
  if (filters.q.trim()) params.set('q', filters.q.trim());
  if (filters.status) params.set('status', filters.status);
  if (cursor) params.set('cursor', cursor);
  params.set('limit', '20');
  // The list endpoint returns `meta` next to `data`, so read the full envelope.
  const envelope = await api<ApiSuccess<AdminUserListItemDto[], PaginationMeta>>(
    `/admin/users?${params.toString()}`,
    { authenticated: true, envelope: true },
  );
  return { items: envelope.data, nextCursor: envelope.meta?.nextCursor ?? null };
}

export const fetchUser = (userId: string) =>
  api<AdminUserDetailDto>(`/admin/users/${userId}`, { authenticated: true });

export const fetchUserMatches = (userId: string) =>
  api<AdminMatchDto[]>(`/admin/users/${userId}/matches`, { authenticated: true });

export const closeMatch = (matchId: string, reason: string) =>
  api<AdminMatchDto>(`/admin/matches/${matchId}/close`, {
    method: 'POST',
    body: { reason },
    authenticated: true,
  });

export const setInteractionRestriction = (userId: string, restrict: boolean, reason: string) =>
  api<AdminUserDetailDto>(
    `/admin/users/${userId}/${restrict ? 'restrict-interactions' : 'lift-interaction-restriction'}`,
    { method: 'POST', body: { reason }, authenticated: true },
  );
