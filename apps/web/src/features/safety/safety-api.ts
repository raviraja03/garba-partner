import type { BlockedMemberDto, MemberWarningDto, MySafetyStatusDto } from '@garba-partner/shared';
import { api } from '../../lib/api-client';

/** Restrictions and unacknowledged warnings on the signed-in member's account. */
export const fetchMySafety = () => api<MySafetyStatusDto>('/me/safety', { authenticated: true });

export const acknowledgeWarning = (warningId: string) =>
  api<MemberWarningDto>(`/me/warnings/${warningId}/acknowledge`, {
    method: 'POST',
    authenticated: true,
  });

export const fetchBlockedMembers = () =>
  api<BlockedMemberDto[]>('/blocks', { authenticated: true });

export const unblockMember = (userId: string) =>
  api<{ userId: string; blocked: false }>(`/blocks/${userId}`, {
    method: 'DELETE',
    authenticated: true,
  });
