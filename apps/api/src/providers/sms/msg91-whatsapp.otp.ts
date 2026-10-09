import { MSG91_WHATSAPP_URL, msg91Post, toMsg91Mobile, type FetchLike } from '../msg91/client.js';
import type { SmsProvider } from './sms.provider.js';

/**
 * Sends login codes as a WhatsApp message through MSG91
 * (docs/notifications/msg91.md#3-login-codes-on-whatsapp).
 *
 * WhatsApp only allows one-time codes in an approved template of the "Authentication" category.
 * Such a template has the code in its body (`body_1`) and, normally, a "Copy code" button that
 * must be given the same code (`button_1`). `hasCopyCodeButton: false` is for a template
 * without that button.
 *
 * The code is generated and checked by this API, never by MSG91 or WhatsApp. It implements
 * `SmsProvider` because that is the "deliver a login code" interface, whatever the channel.
 */
export function createMsg91WhatsAppOtpProvider(options: {
  authKey: string;
  /** The WhatsApp Business number connected in MSG91, digits with country code. */
  integratedNumber: string;
  templateName: string;
  languageCode: string;
  namespace?: string | undefined;
  hasCopyCodeButton: boolean;
  fetchImpl?: FetchLike;
}): SmsProvider {
  const { authKey, integratedNumber, templateName, languageCode, namespace, fetchImpl } = options;
  return {
    name: 'msg91_whatsapp',
    exposesCodeInResponse: false,
    async sendOtp(phoneE164, code) {
      await msg91Post(
        MSG91_WHATSAPP_URL,
        authKey,
        {
          integrated_number: toMsg91Mobile(integratedNumber),
          content_type: 'template',
          payload: {
            messaging_product: 'whatsapp',
            type: 'template',
            template: {
              name: templateName,
              language: { code: languageCode, policy: 'deterministic' },
              ...(namespace ? { namespace } : {}),
              to_and_components: [
                {
                  to: [toMsg91Mobile(phoneE164)],
                  components: {
                    body_1: { type: 'text', value: code },
                    ...(options.hasCopyCodeButton
                      ? { button_1: { subtype: 'url', type: 'text', value: code } }
                      : {}),
                  },
                },
              ],
            },
          },
        },
        fetchImpl,
      );
    },
  };
}
