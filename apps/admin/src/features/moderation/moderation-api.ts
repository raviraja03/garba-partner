import type { AdminSanctionInput, AdminUserDetailDto } from '@garba-partner/shared';
import { api } from '../../lib/api-client';

/** Sanctions (docs/safety/admin-actions.md). Each call is audited server-side. */
export type SanctionPath = 'warn' | 'restrict-chat' | 'suspend' | 'ban';
export type LiftPath = 'lift-chat-restriction' | 'reactivate' | 'unban';

export const sanctionUser = (userId: string, path: SanctionPath, body: AdminSanctionInput) =>
  api<AdminUserDetailDto>(`/admin/users/${userId}/${path}`, {
    method: 'POST',
    body,
    authenticated: true,
  });

export const liftSanction = (userId: string, path: LiftPath, reason: string) =>
  api<AdminUserDetailDto>(`/admin/users/${userId}/${path}`, {
    method: 'POST',
    body: { reason },
    authenticated: true,
  });
