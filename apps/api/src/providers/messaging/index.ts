import type { Logger } from 'pino';
import type { ServerEnv } from '@garba-partner/config/server';
import type { NotificationChannel } from '../../models/index.js';
import type { MetaWhatsAppClient } from '../meta/index.js';
import { createLogMessageProvider } from './log.provider.js';
import type { MessageProvider } from './message.provider.js';
import { createMetaWhatsAppMessageProvider } from './meta.provider.js';
import { parseTemplateMap } from './template-map.js';

export type { MessageProvider, OutboundMessage, SendResult } from './message.provider.js';

/** The provider for each channel, or `null` when the channel is switched off. */
export type MessageProviders = Record<NotificationChannel, MessageProvider | null>;

type MessagingEnv = Pick<
  ServerEnv,
  | 'SMS_ENABLED'
  | 'WHATSAPP_ENABLED'
  | 'MESSAGING_PROVIDER'
  | 'META_WHATSAPP_TEMPLATES'
  | 'META_WHATSAPP_TEMPLATE_LANGUAGE'
>;

/**
 * Builds the channel providers from the environment (docs/notifications/notification-channels.md).
 *
 * - `log` (development): both channels write to the server log instead of sending.
 * - `meta`: WhatsApp goes through the Meta Cloud API. There is no SMS provider, so the SMS
 *   channel is always off with it.
 */
export function createMessageProviders(
  env: MessagingEnv,
  logger: Logger,
  meta: MetaWhatsAppClient | null = null,
): MessageProviders {
  if (env.MESSAGING_PROVIDER === 'log') {
    return {
      sms: env.SMS_ENABLED ? createLogMessageProvider('sms', logger) : null,
      whatsapp: env.WHATSAPP_ENABLED ? createLogMessageProvider('whatsapp', logger) : null,
    };
  }
  if (env.WHATSAPP_ENABLED && !meta) {
    throw new Error(
      'WHATSAPP_ENABLED with MESSAGING_PROVIDER=meta needs the Meta WhatsApp settings',
    );
  }
  return {
    sms: null,
    whatsapp:
      env.WHATSAPP_ENABLED && meta
        ? createMetaWhatsAppMessageProvider({
            client: meta,
            templates: parseTemplateMap(env.META_WHATSAPP_TEMPLATES, 'META_WHATSAPP_TEMPLATES'),
            languageCode: env.META_WHATSAPP_TEMPLATE_LANGUAGE,
          })
        : null,
  };
}
