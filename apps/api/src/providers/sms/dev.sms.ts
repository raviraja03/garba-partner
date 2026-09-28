import type { SmsProvider } from './sms.provider.js';

/**
 * Local development only: sends nothing and logs nothing. The code is handed back to the
 * client in the send-otp response so the OTP screen can display it.
 * `loadServerEnv()` rejects SMS_PROVIDER=dev unless APP_ENV=development.
 */
export const devSmsProvider: SmsProvider = {
  name: 'dev',
  exposesCodeInResponse: true,
  sendOtp: () => Promise.resolve(),
};
