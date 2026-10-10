/** What a provider knows right after handing a login code over for delivery. */
export interface OtpDelivery {
  /**
   * The provider's ID for the message, when it has one. Stored on the OTP request so a later
   * delivery report (the Meta webhook) can be matched to it. Never the code itself.
   */
  providerMessageId: string | null;
}

/**
 * Delivers login codes. Implementations must never log the code or the phone number.
 * `dev` is for local development; `meta_whatsapp` sends the code as a WhatsApp message
 * (docs/notifications/meta-whatsapp.md).
 */
export interface OtpProvider {
  readonly name: string;
  /**
   * True only for the development provider: the API then returns the code in the send-otp
   * response (`devOtp`) instead of sending it. The env schema only allows that provider when
   * APP_ENV=development.
   */
  readonly exposesCodeInResponse: boolean;
  /** Resolves once the provider has ACCEPTED the message; rejects otherwise. */
  sendOtp(phoneE164: string, code: string): Promise<OtpDelivery>;
}
