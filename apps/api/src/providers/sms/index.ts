import type { ServerEnv } from '@garba-partner/config/server';
import type { FetchLike } from '../msg91/client.js';
import { devSmsProvider } from './dev.sms.js';
import { createMsg91WhatsAppOtpProvider } from './msg91-whatsapp.otp.js';
// SMS login codes are switched off for now (login codes go by WhatsApp).
// import { createMsg91SmsProvider } from './msg91.sms.js';
import type { SmsProvider } from './sms.provider.js';

export type { SmsProvider } from './sms.provider.js';

/** Builds whatever delivers login codes: the development stub or WhatsApp through MSG91. */
export function createSmsProvider(
  env: Pick<
    ServerEnv,
    | 'SMS_PROVIDER'
    | 'MSG91_AUTH_KEY'
    | 'MSG91_WHATSAPP_NUMBER'
    | 'MSG91_WHATSAPP_OTP_TEMPLATE'
    | 'MSG91_WHATSAPP_OTP_COPY_BUTTON'
    | 'MSG91_WHATSAPP_LANGUAGE'
    | 'MSG91_WHATSAPP_NAMESPACE'
  >,
  fetchImpl?: FetchLike,
): SmsProvider {
  switch (env.SMS_PROVIDER) {
    case 'dev':
      return devSmsProvider;
    // SMS login codes: switched off for now. To restore, uncomment this case, the import above
    // and the 'msg91' entries in packages/config/src/server/env.ts.
    // case 'msg91':
    //   return createMsg91SmsProvider({
    //     authKey: env.MSG91_AUTH_KEY ?? '',
    //     otpTemplateId: env.MSG91_OTP_TEMPLATE_ID ?? '',
    //     ...(fetchImpl ? { fetchImpl } : {}),
    //   });
    case 'msg91_whatsapp':
      // `loadServerEnv()` guarantees these values when SMS_PROVIDER=msg91_whatsapp.
      return createMsg91WhatsAppOtpProvider({
        authKey: env.MSG91_AUTH_KEY ?? '',
        integratedNumber: env.MSG91_WHATSAPP_NUMBER ?? '',
        templateName: env.MSG91_WHATSAPP_OTP_TEMPLATE ?? '',
        languageCode: env.MSG91_WHATSAPP_LANGUAGE,
        namespace: env.MSG91_WHATSAPP_NAMESPACE,
        hasCopyCodeButton: env.MSG91_WHATSAPP_OTP_COPY_BUTTON,
        ...(fetchImpl ? { fetchImpl } : {}),
      });
  }
}
