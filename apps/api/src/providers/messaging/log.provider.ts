import { randomUUID } from 'node:crypto';
import type { Logger } from 'pino';
import { maskPhone } from '../../lib/log-sanitize.js';
import type { NotificationChannel } from '../../models/index.js';
import type { MessageProvider } from './message.provider.js';

/**
 * Local development only: sends nothing. It writes the message to the server log (masked
 * number) so the whole flow can be exercised without a provider account.
 * `loadServerEnv()` refuses SMS_ENABLED / WHATSAPP_ENABLED outside APP_ENV=development while
 * this is the only provider.
 */
export function createLogMessageProvider(
  channel: NotificationChannel,
  logger: Logger,
): MessageProvider {
  return {
    name: 'log',
    channel,
    send(message) {
      logger.info(
        `[NOTIFICATION] ${channel.toUpperCase()} | to=${maskPhone(message.to)} | not sent (development log provider) | "${message.text}"`,
      );
      return Promise.resolve({ providerMessageId: `log-${randomUUID()}` });
    },
  };
}
