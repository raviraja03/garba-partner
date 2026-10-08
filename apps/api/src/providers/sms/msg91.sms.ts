import {
  MSG91_FLOW_OPTIONS,
  MSG91_FLOW_URL,
  msg91Post,
  toMsg91Mobile,
  type FetchLike,
} from '../msg91/client.js';
import type { SmsProvider } from './sms.provider.js';

/**
 * Sends login codes through MSG91's Flow API (docs/notifications/msg91.md#3-login-codes).
 *
 * The SMS text lives in MSG91 as a DLT-approved template; this only supplies the code. The
 * template must contain exactly one variable named `otp`, written `##otp##`.
 * The code is generated and checked by this API, never by MSG91.
 */
export function createMsg91SmsProvider(options: {
  authKey: string;
  otpTemplateId: string;
  fetchImpl?: FetchLike;
}): SmsProvider {
  const { authKey, otpTemplateId, fetchImpl } = options;
  return {
    name: 'msg91',
    exposesCodeInResponse: false,
    async sendOtp(phoneE164, code) {
      await msg91Post(
        MSG91_FLOW_URL,
        authKey,
        {
          template_id: otpTemplateId,
          ...MSG91_FLOW_OPTIONS,
          recipients: [{ mobiles: toMsg91Mobile(phoneE164), otp: code }],
        },
        fetchImpl,
      );
    },
  };
}
