import type { CreationOptional, InferAttributes, InferCreationAttributes } from 'sequelize';
import {
  Column,
  CreatedAt,
  DataType,
  ForeignKey,
  Model,
  Table,
  UpdatedAt,
} from 'sequelize-typescript';
import { NOTIFICATION_TYPES, type NotificationType } from '@garba-partner/shared';
import { Notification } from './notification.model.js';
import { User } from './user.model.js';

/** Channels a notification can be delivered over, outside the app. Add new ones here. */
export const NOTIFICATION_CHANNELS = ['sms', 'whatsapp'] as const;
export type NotificationChannel = (typeof NOTIFICATION_CHANNELS)[number];

/**
 * `pending` (about to be sent) → `sent` (the provider accepted it) or `failed`. `delivered` is
 * set by a provider delivery receipt, when a provider that sends them is connected. "Read" lives
 * on the in-app `notifications.read_at`.
 */
export const DELIVERY_STATUSES = ['pending', 'sent', 'delivered', 'failed'] as const;
export type DeliveryStatus = (typeof DELIVERY_STATUSES)[number];

/**
 * One attempt to deliver a notification over a channel
 * (docs/notifications/notification-channels.md). `recipient` is always the masked number.
 */
@Table({ tableName: 'notification_deliveries' })
export class NotificationDelivery extends Model<
  InferAttributes<NotificationDelivery>,
  InferCreationAttributes<NotificationDelivery>
> {
  @Column({ type: DataType.UUID, primaryKey: true, defaultValue: DataType.UUIDV4 })
  override id!: CreationOptional<string>;

  @ForeignKey(() => User)
  @Column({ type: DataType.UUID, allowNull: false })
  userId!: string;

  @ForeignKey(() => Notification)
  @Column({ type: DataType.UUID, allowNull: true })
  notificationId!: CreationOptional<string | null>;

  @Column({
    type: DataType.STRING(30),
    allowNull: false,
    validate: { isIn: [[...NOTIFICATION_TYPES]] },
  })
  notificationType!: NotificationType;

  @Column({ type: DataType.STRING(120), allowNull: false })
  title!: string;

  @Column({ type: DataType.STRING(500), allowNull: false })
  message!: string;

  @Column({
    type: DataType.STRING(20),
    allowNull: false,
    validate: { isIn: [[...NOTIFICATION_CHANNELS]] },
  })
  channel!: NotificationChannel;

  @Column({ type: DataType.STRING(20), allowNull: false })
  recipient!: string;

  @Column({
    type: DataType.STRING(20),
    allowNull: false,
    defaultValue: 'pending',
    validate: { isIn: [[...DELIVERY_STATUSES]] },
  })
  status!: CreationOptional<DeliveryStatus>;

  @Column({ type: DataType.STRING(40), allowNull: false })
  provider!: string;

  @Column({ type: DataType.STRING(120), allowNull: true })
  providerMessageId!: CreationOptional<string | null>;

  @Column({ type: DataType.STRING(300), allowNull: true })
  errorMessage!: CreationOptional<string | null>;

  /** Idempotency key: `<notification id>:<channel>`. Unique. */
  @Column({ type: DataType.STRING(120), allowNull: false })
  referenceKey!: string;

  @Column({ type: DataType.DATE, allowNull: true })
  sentAt!: CreationOptional<Date | null>;

  @Column({ type: DataType.DATE, allowNull: true })
  deliveredAt!: CreationOptional<Date | null>;

  @CreatedAt
  override createdAt!: CreationOptional<Date>;

  @UpdatedAt
  override updatedAt!: CreationOptional<Date>;
}
