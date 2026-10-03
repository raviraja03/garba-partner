import type { AdminLoginInput, AdminMeDto, AdminSessionDto } from '@garba-partner/shared';
import { api } from '../../lib/api-client';

/** Email + password → session. */
export function login(input: AdminLoginInput): Promise<AdminSessionDto> {
  return api<AdminSessionDto>('/admin/auth/login', { method: 'POST', body: input });
}

export function fetchMe(): Promise<AdminMeDto> {
  return api<AdminMeDto>('/admin/auth/me', { authenticated: true });
}

export function logout(): Promise<null> {
  return api<null>('/admin/auth/logout', { method: 'POST', authenticated: true });
}
