import { QueryTypes } from 'sequelize';
import type { Sequelize } from 'sequelize-typescript';
import type { Logger } from 'pino';
import type { ServerEnv } from '@garba-partner/config/server';
import { APP_NAME, type NotificationType } from '@garba-partner/shared';
import { decryptString } from '../../lib/crypto.js';
import { maskPhone, sanitizeLogText } from '../../lib/log-sanitize.js';
import {
  NOTIFICATION_CHANNELS,
  NotificationDelivery,
  User,
  type DeliveryStatus,
  type Notification,
  type NotificationChannel,
} from '../../models/index.js';
import type { MessageProvider, MessageProviders } from '../../providers/messaging/index.js';

export interface ChannelMessageInput {
  userId: string;
  type: NotificationType;
  title: string;
  message: string;
  /**
   * Identifies the thing being announced (normally the in-app notification's ID). Sending the
   * same reference twice over one channel does nothing the second time.
   */
  referenceId: string;
  /** The in-app notification this delivers, when there is one. */
  notificationId?: string | null;
}

export interface DeliveryOutcome {
  channel: NotificationChannel;
  /** `skipped`: channel off, already sent for this reference, or the member has no number. */
  status: Extract<DeliveryStatus, 'sent' | 'failed'> | 'skipped';
}

/**
 * Sends notifications by SMS and WhatsApp and records every attempt in
 * `notification_deliveries` (docs/notifications/notification-channels.md).
 *
 * Nothing here ever throws: a failed or slow channel can never fail the API request or the job
 * that caused the notification, and one channel failing does not stop the other.
 */
export interface ChannelNotifier {
  sendSMS(input: ChannelMessageInput): Promise<DeliveryOutcome>;
  sendWhatsApp(input: ChannelMessageInput): Promise<DeliveryOutcome>;
  /** Sends over every enabled channel. One outcome per channel. */
  sendNotification(input: ChannelMessageInput): Promise<DeliveryOutcome[]>;
  /** Delivers stored in-app notifications (called by the Notifier after it has saved them). */
  deliver(notifications: readonly Notification[]): Promise<void>;
}

/**
 * Fixed wording per type. Deliberately generic: an SMS can be read on a lock screen, so it never
 * names another member and never repeats chat text, an event address or a moderator's reason.
 */
const CHANNEL_TEXT: Record<NotificationType, { title: string; message: string }> = {
  interest_received: {
    title: 'New interest',
    message: 'someone would like to be your Garba partner. Open the app to respond.',
  },
  interest_accepted: {
    title: 'Interest accepted',
    message: 'your interest was accepted. Open the app to start chatting.',
  },
  match_created: {
    title: 'New match',
    message: 'you have a new Garba match. Open the app to say hello.',
  },
  new_message: {
    title: 'New message',
    message: 'you have new messages. Open the app to read them.',
  },
  verification_completed: {
    title: 'Verification update',
    message: 'your verification has been reviewed. Open the app to see the result.',
  },
  event_reminder: {
    title: 'Event reminder',
    message: 'an event you are going to starts soon. Open the app for details.',
  },
  safety: {
    title: 'Account notice',
    message: 'there is an important notice about your account. Open the app to read it.',
  },
  booking: {
    title: 'Pass update',
    message: 'there is an update on your event pass. Open the app to see it.',
  },
};

export function channelTextFor(type: NotificationType): { title: string; message: string } {
  const text = CHANNEL_TEXT[type];
  return { title: text.title, message: `${APP_NAME}: ${text.message}` };
}

export function createChannelNotifier(deps: {
  sequelize: Sequelize;
  env: Pick<ServerEnv, 'PHONE_ENCRYPTION_KEY'>;
  providers: MessageProviders;
  logger: Logger;
}): ChannelNotifier {
  const { sequelize, env, providers, logger } = deps;

  /** The member's number, or null when the account is gone, banned or has no number. */
  async function phoneOf(userId: string): Promise<string | null> {
    const user = await User.findOne({
      where: { id: userId, status: ['active', 'suspended'] },
      attributes: ['id', 'phoneEncrypted'],
    });
    if (!user?.phoneEncrypted) return null;
    return decryptString(user.phoneEncrypted, env.PHONE_ENCRYPTION_KEY);
  }

  const report = (
    channel: NotificationChannel,
    userId: string,
    status: 'SENT' | 'FAILED',
    error?: string,
  ): void => {
    const text = `[NOTIFICATION] ${channel.toUpperCase()} | userId=${userId} | status=${status}${error ? ` | error=${error}` : ''}`;
    if (error) logger.warn(text);
    else logger.info(text);
  };

  async function attempt(
    provider: MessageProvider,
    input: ChannelMessageInput,
    phone: string,
  ): Promise<DeliveryOutcome> {
    const { channel } = provider;
    const referenceKey = `${input.referenceId}:${channel}`;

    // Claim the reference first. Only the request that inserts the row sends the message, so
    // retries, repeated events and a second process all stop here.
    const claimed = await sequelize.query<{ id: string }>(
      `INSERT INTO notification_deliveries
         (user_id, notification_id, notification_type, title, message, channel, recipient,
          status, provider, reference_key)
       VALUES (:userId, :notificationId, :type, :title, :message, :channel, :recipient,
               'pending', :provider, :referenceKey)
       ON CONFLICT (reference_key) DO NOTHING
       RETURNING id`,
      {
        type: QueryTypes.SELECT,
        replacements: {
          userId: input.userId,
          notificationId: input.notificationId ?? null,
          type: input.type,
          title: input.title.slice(0, 120),
          message: input.message.slice(0, 500),
          channel,
          recipient: maskPhone(phone),
          provider: provider.name,
          referenceKey,
        },
      },
    );
    const id = claimed[0]?.id;
    if (!id) return { channel, status: 'skipped' };

    try {
      const result = await provider.send({
        to: phone,
        title: input.title,
        text: input.message,
        reference: referenceKey,
      });
      await NotificationDelivery.update(
        { status: 'sent', sentAt: new Date(), providerMessageId: result.providerMessageId },
        { where: { id } },
      );
      report(channel, input.userId, 'SENT');
      return { channel, status: 'sent' };
    } catch (err) {
      // Provider errors can quote the number or an account detail: store a cleaned-up message.
      const error = sanitizeLogText(err instanceof Error ? err.message : 'Unknown provider error');
      await NotificationDelivery.update(
        { status: 'failed', errorMessage: error || 'Unknown provider error' },
        { where: { id } },
      );
      report(channel, input.userId, 'FAILED', error);
      return { channel, status: 'failed' };
    }
  }

  /** `attempt` with the guarantee that nothing escapes (database down, bad key, …). */
  async function send(
    channel: NotificationChannel,
    input: ChannelMessageInput,
    knownPhone?: string | null,
  ): Promise<DeliveryOutcome> {
    const provider = providers[channel];
    if (!provider) return { channel, status: 'skipped' };
    try {
      const phone = knownPhone === undefined ? await phoneOf(input.userId) : knownPhone;
      if (!phone) return { channel, status: 'skipped' };
      return await attempt(provider, input, phone);
    } catch (err) {
      logger.error(
        { err, channel, type: input.type, userId: input.userId },
        'Notification delivery could not be recorded',
      );
      return { channel, status: 'failed' };
    }
  }

  async function sendNotification(input: ChannelMessageInput): Promise<DeliveryOutcome[]> {
    const enabled = NOTIFICATION_CHANNELS.filter((channel) => providers[channel] !== null);
    if (enabled.length === 0) return [];
    let phone: string | null;
    try {
      phone = await phoneOf(input.userId);
    } catch (err) {
      logger.error({ err, userId: input.userId }, 'Notification recipient could not be loaded');
      return enabled.map((channel) => ({ channel, status: 'failed' as const }));
    }
    // Channels are independent: one failing or hanging never holds back the other.
    return Promise.all(enabled.map((channel) => send(channel, input, phone)));
  }

  return {
    sendSMS: (input) => send('sms', input),
    sendWhatsApp: (input) => send('whatsapp', input),
    sendNotification,
    async deliver(notifications) {
      for (const notification of notifications) {
        await sendNotification({
          userId: notification.userId,
          type: notification.type,
          ...channelTextFor(notification.type),
          referenceId: notification.id,
          notificationId: notification.id,
        });
      }
    },
  };
}
