import type { ServerEnv } from '@garba-partner/config/server';
import type { MetaWhatsAppClient } from '../meta/index.js';
import { devOtpProvider } from './dev.otp.js';
import { createMetaWhatsAppOtpProvider } from './meta-whatsapp.otp.js';
import type { OtpProvider } from './otp.provider.js';

export type { OtpDelivery, OtpProvider } from './otp.provider.js';

/**
 * Builds whatever delivers login codes: the development stub, or WhatsApp through Meta.
 * `meta` is the shared Meta client (`createMetaClientFromEnv`); `loadServerEnv()` guarantees
 * it can be built whenever OTP_PROVIDER=meta_whatsapp.
 */
export function createOtpProvider(
  env: Pick<
    ServerEnv,
    'OTP_PROVIDER' | 'META_WHATSAPP_OTP_TEMPLATE' | 'META_WHATSAPP_TEMPLATE_LANGUAGE'
  >,
  meta: MetaWhatsAppClient | null,
): OtpProvider {
  switch (env.OTP_PROVIDER) {
    case 'dev':
      return devOtpProvider;
    case 'meta_whatsapp':
      if (!meta || !env.META_WHATSAPP_OTP_TEMPLATE) {
        throw new Error('OTP_PROVIDER=meta_whatsapp needs the Meta WhatsApp settings');
      }
      return createMetaWhatsAppOtpProvider({
        client: meta,
        templateName: env.META_WHATSAPP_OTP_TEMPLATE,
        languageCode: env.META_WHATSAPP_TEMPLATE_LANGUAGE,
      });
  }
}
