import type {
  AdminLoginChallengeDto,
  AdminLoginInput,
  AdminMeDto,
  AdminSessionDto,
  AdminTotpSetupDto,
} from '@garba-partner/shared';
import { api } from '../../lib/api-client';

/** Step 1: email + password → a two-factor challenge (never a session). */
export function login(input: AdminLoginInput): Promise<AdminLoginChallengeDto> {
  return api<AdminLoginChallengeDto>('/admin/auth/login', { method: 'POST', body: input });
}

/** First sign-in: the authenticator secret to add to an authenticator app. */
export function setupTwoFactor(challengeToken: string): Promise<AdminTotpSetupDto> {
  return api<AdminTotpSetupDto>('/admin/auth/login/totp-setup', {
    method: 'POST',
    body: { challengeToken },
  });
}

/** Step 2: the 6-digit code → session. */
export function verifyTwoFactor(challengeToken: string, code: string): Promise<AdminSessionDto> {
  return api<AdminSessionDto>('/admin/auth/login/verify', {
    method: 'POST',
    body: { challengeToken, code },
  });
}

export function fetchMe(): Promise<AdminMeDto> {
  return api<AdminMeDto>('/admin/auth/me', { authenticated: true });
}

export function logout(): Promise<null> {
  return api<null>('/admin/auth/logout', { method: 'POST', authenticated: true });
}
