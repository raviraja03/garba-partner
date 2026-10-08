import type { Logger } from 'pino';
import type { ServerEnv } from '@garba-partner/config/server';
import type { NotificationChannel } from '../../models/index.js';
import { createLogMessageProvider } from './log.provider.js';
import type { MessageProvider } from './message.provider.js';

export type { MessageProvider, OutboundMessage, SendResult } from './message.provider.js';

/** The provider for each channel, or `null` when the channel is switched off. */
export type MessageProviders = Record<NotificationChannel, MessageProvider | null>;

/**
 * Builds the channel providers from the environment. Real providers (MSG91, Twilio, the
 * WhatsApp Business API, …) are added here, each behind `MessageProvider`.
 */
export function createMessageProviders(
  env: Pick<ServerEnv, 'SMS_ENABLED' | 'WHATSAPP_ENABLED'>,
  logger: Logger,
): MessageProviders {
  return {
    sms: env.SMS_ENABLED ? createLogMessageProvider('sms', logger) : null,
    whatsapp: env.WHATSAPP_ENABLED ? createLogMessageProvider('whatsapp', logger) : null,
  };
}
