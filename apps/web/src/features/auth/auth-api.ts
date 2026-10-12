import type { MeDto, MemberSessionDto, PhoneLoginInput } from '@garba-partner/shared';
import { api } from '../../lib/api-client';

/**
 * Exchanges a Firebase ID token (proof that the member just verified their number by SMS) for
 * our own session. Only the token is sent: the API reads the number from it after verifying it.
 */
export function loginWithPhone(input: PhoneLoginInput): Promise<MemberSessionDto> {
  return api<MemberSessionDto>('/auth/phone', { method: 'POST', body: input });
}

export function fetchMe(): Promise<MeDto> {
  return api<MeDto>('/auth/me', { authenticated: true });
}

export function logout(allDevices = false): Promise<null> {
  return api<null>('/auth/logout', {
    method: 'POST',
    body: { allDevices },
    authenticated: true,
  });
}
