import type {
  MeDto,
  MemberSessionDto,
  SendOtpInput,
  SendOtpResultDto,
  VerifyOtpInput,
} from '@garba-partner/shared';
import { api } from '../../lib/api-client';

export function sendOtp(input: SendOtpInput): Promise<SendOtpResultDto> {
  return api<SendOtpResultDto>('/auth/send-otp', { method: 'POST', body: input });
}

export function verifyOtp(input: VerifyOtpInput): Promise<MemberSessionDto> {
  return api<MemberSessionDto>('/auth/verify-otp', { method: 'POST', body: input });
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
