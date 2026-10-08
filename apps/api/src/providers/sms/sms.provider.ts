/**
 * Sends one-time codes. Implementations must never log the code or the phone number.
 * `dev` is for local development; `msg91` sends real SMS (docs/notifications/msg91.md).
 */
export interface SmsProvider {
  readonly name: string;
  /**
   * True only for the development provider: the API then returns the code in the send-otp
   * response (`devOtp`) instead of texting it. The env schema only allows that provider when
   * APP_ENV=development.
   */
  readonly exposesCodeInResponse: boolean;
  sendOtp(phoneE164: string, code: string): Promise<void>;
}
