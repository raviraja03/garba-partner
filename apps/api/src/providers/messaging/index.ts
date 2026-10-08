import type { Logger } from 'pino';
import type { ServerEnv } from '@garba-partner/config/server';
import type { NotificationChannel } from '../../models/index.js';
import type { FetchLike } from '../msg91/client.js';
import { createLogMessageProvider } from './log.provider.js';
import type { MessageProvider } from './message.provider.js';
import {
  createMsg91SmsMessageProvider,
  createMsg91WhatsAppProvider,
  parseTemplateMap,
} from './msg91.provider.js';

export type { MessageProvider, OutboundMessage, SendResult } from './message.provider.js';

/** The provider for each channel, or `null` when the channel is switched off. */
export type MessageProviders = Record<NotificationChannel, MessageProvider | null>;

type MessagingEnv = Pick<
  ServerEnv,
  | 'SMS_ENABLED'
  | 'WHATSAPP_ENABLED'
  | 'MESSAGING_PROVIDER'
  | 'MSG91_AUTH_KEY'
  | 'MSG91_SMS_TEMPLATE_IDS'
  | 'MSG91_WHATSAPP_NUMBER'
  | 'MSG91_WHATSAPP_TEMPLATES'
  | 'MSG91_WHATSAPP_LANGUAGE'
  | 'MSG91_WHATSAPP_NAMESPACE'
>;

/**
 * Builds the channel providers from the environment (docs/notifications/msg91.md).
 * `loadServerEnv()` has already checked that everything MSG91 needs is present.
 */
export function createMessageProviders(
  env: MessagingEnv,
  logger: Logger,
  fetchImpl?: FetchLike,
): MessageProviders {
  if (env.MESSAGING_PROVIDER === 'log') {
    return {
      sms: env.SMS_ENABLED ? createLogMessageProvider('sms', logger) : null,
      whatsapp: env.WHATSAPP_ENABLED ? createLogMessageProvider('whatsapp', logger) : null,
    };
  }

  const authKey = env.MSG91_AUTH_KEY ?? '';
  return {
    sms: env.SMS_ENABLED
      ? createMsg91SmsMessageProvider({
          authKey,
          templates: parseTemplateMap(env.MSG91_SMS_TEMPLATE_IDS, 'MSG91_SMS_TEMPLATE_IDS'),
          ...(fetchImpl ? { fetchImpl } : {}),
        })
      : null,
    whatsapp: env.WHATSAPP_ENABLED
      ? createMsg91WhatsAppProvider({
          authKey,
          integratedNumber: env.MSG91_WHATSAPP_NUMBER ?? '',
          templates: parseTemplateMap(env.MSG91_WHATSAPP_TEMPLATES, 'MSG91_WHATSAPP_TEMPLATES'),
          languageCode: env.MSG91_WHATSAPP_LANGUAGE,
          namespace: env.MSG91_WHATSAPP_NAMESPACE,
          ...(fetchImpl ? { fetchImpl } : {}),
        })
      : null,
  };
}
