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
import { ATTENDANCE_STATUSES, type AttendanceStatus } from '@garba-partner/shared';
import { Event } from './event.model.js';
import { User } from './user.model.js';

/**
 * A member's attendance at an event. PRIVATE: only revealed to another member when both look for
 * a partner at the same event (docs/matching/privacy.md).
 */
@Table({ tableName: 'event_attendances' })
export class EventAttendance extends Model<
  InferAttributes<EventAttendance>,
  InferCreationAttributes<EventAttendance>
> {
  @Column({ type: DataType.UUID, primaryKey: true, defaultValue: DataType.UUIDV4 })
  override id!: CreationOptional<string>;

  @ForeignKey(() => Event)
  @Column({ type: DataType.UUID, allowNull: false })
  eventId!: string;

  @ForeignKey(() => User)
  @Column({ type: DataType.UUID, allowNull: false })
  userId!: string;

  @Column({
    type: DataType.STRING(20),
    allowNull: false,
    validate: { isIn: [[...ATTENDANCE_STATUSES]] },
  })
  status!: AttendanceStatus;

  @Column({ type: DataType.BOOLEAN, allowNull: false, defaultValue: false })
  lookingForPartner!: CreationOptional<boolean>;

  @CreatedAt
  override createdAt!: CreationOptional<Date>;

  @UpdatedAt
  override updatedAt!: CreationOptional<Date>;

  @BelongsTo(() => Event, { foreignKey: 'eventId' })
  event?: NonAttribute<Event>;
}
