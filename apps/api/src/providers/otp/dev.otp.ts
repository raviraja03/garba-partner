import type { OtpProvider } from './otp.provider.js';

/**
 * Local development only: sends nothing and logs nothing. The code is handed back to the
 * client in the send-otp response so the OTP screen can display it.
 * `loadServerEnv()` rejects OTP_PROVIDER=dev unless APP_ENV=development.
 */
export const devOtpProvider: OtpProvider = {
  name: 'dev',
  exposesCodeInResponse: true,
  sendOtp: () => Promise.resolve({ providerMessageId: null }),
};
