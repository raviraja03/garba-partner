import type { NotificationChannel } from '../../models/index.js';

export interface OutboundMessage {
  /** Full phone number in E.164. Implementations must never log it. */
  to: string;
  title: string;
  text: string;
  /** Our idempotency key; pass it to the provider when it supports one. */
  reference: string;
}

export interface SendResult {
  /** The provider's own ID for the message (used to match delivery receipts), if it gives one. */
  providerMessageId: string | null;
}

/**
 * Sends a notification over one channel (SMS or WhatsApp). One implementation per provider and
 * channel (docs/notifications/notification-channels.md#5-adding-a-real-provider).
 *
 * `send` resolves when the provider has ACCEPTED the message and rejects otherwise. Errors must
 * not contain credentials: the message is stored in `notification_deliveries.error_message`.
 */
export interface MessageProvider {
  readonly name: string;
  readonly channel: NotificationChannel;
  send(message: OutboundMessage): Promise<SendResult>;
}
