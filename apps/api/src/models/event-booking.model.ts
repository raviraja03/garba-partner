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
  BOOKING_CANCEL_REASONS,
  BOOKING_STATUSES,
  REFUND_STATUSES,
  type BookingCancelReason,
  type BookingStatus,
  type RefundStatus,
} from '@garba-partner/shared';
import { Event } from './event.model.js';
import { Order } from './order.model.js';
import { Payment } from './payment.model.js';
import { User } from './user.model.js';

/** A pass booking: exactly one per paid order (confirmed, or cancelled with a refund). */
@Table({ tableName: 'event_bookings' })
export class EventBooking extends Model<
  InferAttributes<EventBooking>,
  InferCreationAttributes<EventBooking>
> {
  @Column({ type: DataType.UUID, primaryKey: true, defaultValue: DataType.UUIDV4 })
  override id!: CreationOptional<string>;

  @Column({ type: DataType.STRING(16), allowNull: false })
  code!: string;

  @ForeignKey(() => Order)
  @Column({ type: DataType.UUID, allowNull: false })
  orderId!: string;

  @ForeignKey(() => Payment)
  @Column({ type: DataType.UUID, allowNull: false })
  paymentId!: string;

  @ForeignKey(() => User)
  @Column({ type: DataType.UUID, allowNull: false })
  userId!: string;

  @ForeignKey(() => Event)
  @Column({ type: DataType.UUID, allowNull: false })
  eventId!: string;

  @Column({ type: DataType.SMALLINT, allowNull: false })
  quantity!: number;

  @Column({ type: DataType.INTEGER, allowNull: false })
  amountPaise!: number;

  @Column({
    type: DataType.STRING(20),
    allowNull: false,
    defaultValue: 'confirmed',
    validate: { isIn: [[...BOOKING_STATUSES]] },
  })
  status!: CreationOptional<BookingStatus>;

  @Column({
    type: DataType.STRING(20),
    allowNull: false,
    defaultValue: 'none',
    validate: { isIn: [[...REFUND_STATUSES]] },
  })
  refundStatus!: CreationOptional<RefundStatus>;

  @Column({
    type: DataType.STRING(30),
    allowNull: true,
    validate: { isIn: [[...BOOKING_CANCEL_REASONS]] },
  })
  cancelReason!: CreationOptional<BookingCancelReason | null>;

  @Column({ type: DataType.DATE, allowNull: true })
  cancelledAt!: CreationOptional<Date | null>;

  @CreatedAt
  override createdAt!: CreationOptional<Date>;

  @UpdatedAt
  override updatedAt!: CreationOptional<Date>;

  @BelongsTo(() => Event, { foreignKey: 'eventId', as: 'event' })
  event?: NonAttribute<Event>;
}
