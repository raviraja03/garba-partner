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
import { User } from './user.model.js';

/**
 * A member's notification settings. Optional: no row means every type is on. The (underscored)
 * column names match `CONFIGURABLE_NOTIFICATION_TYPES`.
 */
@Table({ tableName: 'notification_preferences' })
export class NotificationPreference extends Model<
  InferAttributes<NotificationPreference>,
  InferCreationAttributes<NotificationPreference>
> {
  @ForeignKey(() => User)
  @Column({ type: DataType.UUID, primaryKey: true })
  userId!: string;

  @Column({ type: DataType.BOOLEAN, allowNull: false, defaultValue: true })
  interestReceived!: CreationOptional<boolean>;

  @Column({ type: DataType.BOOLEAN, allowNull: false, defaultValue: true })
  interestAccepted!: CreationOptional<boolean>;

  @Column({ type: DataType.BOOLEAN, allowNull: false, defaultValue: true })
  matchCreated!: CreationOptional<boolean>;

  @Column({ type: DataType.BOOLEAN, allowNull: false, defaultValue: true })
  newMessage!: CreationOptional<boolean>;

  @Column({ type: DataType.BOOLEAN, allowNull: false, defaultValue: true })
  verificationCompleted!: CreationOptional<boolean>;

  @Column({ type: DataType.BOOLEAN, allowNull: false, defaultValue: true })
  eventReminder!: CreationOptional<boolean>;

  /**
   * Consent to be sent notifications on WhatsApp. Off until the member turns it on (WhatsApp
   * requires opt-in). Unlike the type switches above, a missing row means OFF.
   */
  @Column({ type: DataType.BOOLEAN, allowNull: false, defaultValue: false })
  whatsappOptIn!: CreationOptional<boolean>;

  @Column({ type: DataType.DATE, allowNull: true })
  whatsappOptInAt!: CreationOptional<Date | null>;

  @CreatedAt
  override createdAt!: CreationOptional<Date>;

  @UpdatedAt
  override updatedAt!: CreationOptional<Date>;
}
