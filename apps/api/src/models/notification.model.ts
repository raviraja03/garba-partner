import type {
  CreationOptional,
  InferAttributes,
  InferCreationAttributes,
  NonAttribute,
} from 'sequelize';
import {
  BelongsTo,
  Column,
  CreatedAt,
  DataType,
  ForeignKey,
  Model,
  Table,
  UpdatedAt,
} from 'sequelize-typescript';
import {
  NOTIFICATION_TYPES,
  type BookingNotificationKind,
  type NotificationType,
  type SafetyNotificationKind,
  type VerificationType,
} from '@garba-partner/shared';
import { Event } from './event.model.js';
import { Match } from './match.model.js';
import { PartnerInterest } from './partner-interest.model.js';
import { User } from './user.model.js';

/** Small non-personal values only (docs/notifications/notifications.md#4-privacy). */
export interface NotificationData {
  safetyKind?: SafetyNotificationKind;
  verificationType?: VerificationType;
  outcome?: 'approved' | 'rejected';
  bookingKind?: BookingNotificationKind;
}

/** An in-app notification for `userId`. */
@Table({ tableName: 'notifications' })
export class Notification extends Model<
  InferAttributes<Notification>,
  InferCreationAttributes<Notification>
> {
  @Column({ type: DataType.UUID, primaryKey: true, defaultValue: DataType.UUIDV4 })
  override id!: CreationOptional<string>;

  @ForeignKey(() => User)
  @Column({ type: DataType.UUID, allowNull: false })
  userId!: string;

  @Column({
    type: DataType.STRING(30),
    allowNull: false,
    validate: { isIn: [[...NOTIFICATION_TYPES]] },
  })
  type!: NotificationType;

  @ForeignKey(() => User)
  @Column({ type: DataType.UUID, allowNull: true })
  actorUserId!: CreationOptional<string | null>;

  @ForeignKey(() => Match)
  @Column({ type: DataType.UUID, allowNull: true })
  matchId!: CreationOptional<string | null>;

  @ForeignKey(() => PartnerInterest)
  @Column({ type: DataType.UUID, allowNull: true })
  interestId!: CreationOptional<string | null>;

  @ForeignKey(() => Event)
  @Column({ type: DataType.UUID, allowNull: true })
  eventId!: CreationOptional<string | null>;

  @Column({ type: DataType.UUID, allowNull: true })
  bookingId!: CreationOptional<string | null>;

  @Column({ type: DataType.JSONB, allowNull: false, defaultValue: {} })
  data!: CreationOptional<NotificationData>;

  @Column({ type: DataType.INTEGER, allowNull: false, defaultValue: 1 })
  count!: CreationOptional<number>;

  @Column({ type: DataType.DATE, allowNull: false, defaultValue: DataType.NOW })
  occurredAt!: CreationOptional<Date>;

  @Column({ type: DataType.DATE, allowNull: true })
  readAt!: CreationOptional<Date | null>;

  @CreatedAt
  override createdAt!: CreationOptional<Date>;

  @UpdatedAt
  override updatedAt!: CreationOptional<Date>;

  @BelongsTo(() => Event, { foreignKey: 'eventId', as: 'event' })
  event?: NonAttribute<Event | null>;
}
