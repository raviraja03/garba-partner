import { metaMessageRef, type MetaWhatsAppClient } from '../meta/index.js';
import type { OtpProvider } from './otp.provider.js';

/**
 * Sends login codes as a WhatsApp message through the Meta Cloud API
 * (docs/notifications/meta-whatsapp.md#4-login-codes).
 *
 * WhatsApp only allows one-time codes in an approved template of the "Authentication"
 * category. Meta requires the code twice: as the body value and as the value of the template's
 * button (copy-code, one-tap and zero-tap templates all carry it as a `url` button at index 0).
 *
 * The code is generated and checked by this API, never by Meta.
 */
export function createMetaWhatsAppOtpProvider(options: {
  client: MetaWhatsAppClient;
  templateName: string;
  languageCode: string;
}): OtpProvider {
  const { client, templateName, languageCode } = options;
  return {
    name: 'meta_whatsapp',
    exposesCodeInResponse: false,
    async sendOtp(phoneE164, code) {
      const { messageId } = await client.sendTemplate({
        to: phoneE164,
        template: templateName,
        language: languageCode,
        components: [
          { type: 'body', parameters: [{ type: 'text', text: code }] },
          {
            type: 'button',
            sub_type: 'url',
            index: '0',
            parameters: [{ type: 'text', text: code }],
          },
        ],
      });
      return { providerMessageId: metaMessageRef(messageId) };
    },
  };
}
