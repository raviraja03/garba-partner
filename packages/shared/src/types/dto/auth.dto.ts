import type { AdminPermission, AdminRole } from '../../constants/admin.js';
import type { UserStatus } from '../../constants/enums.js';

/** Response of `POST /api/v1/auth/send-otp`. The response is identical for new and existing numbers. */
export interface SendOtpResultDto {
  expiresInSeconds: number;
  resendAvailableInSeconds: number;
  /**
   * DEVELOPMENT ONLY (SMS_PROVIDER=dev, APP_ENV=development). Never present otherwise.
   */
  devOtp?: string;
}

/** The authenticated member (never contains the phone number). */
export interface MeDto {
  id: string;
  status: UserStatus;
  onboardingStatus: 'incomplete' | 'complete';
  photoVerified: boolean;
  displayName: string | null;
}

/** Returned by verify-otp and refresh. The refresh token travels only in an httpOnly cookie. */
export interface MemberSessionDto {
  accessToken: string;
  /** ISO-8601 expiry of the access token. */
  accessTokenExpiresAt: string;
  user: MeDto;
}

export interface AdminMeDto {
  id: string;
  email: string;
  name: string;
  role: AdminRole;
  permissions: readonly AdminPermission[];
}

export interface AdminSessionDto {
  accessToken: string;
  accessTokenExpiresAt: string;
  admin: AdminMeDto;
}
