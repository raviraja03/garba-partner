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
import { ORDER_STATUSES, type OrderStatus } from '@garba-partner/shared';
import { Event } from './event.model.js';
import { User } from './user.model.js';

/** A pass checkout attempt (docs/payments/payment-flow.md). Amounts are in paise. */
@Table({ tableName: 'orders' })
export class Order extends Model<InferAttributes<Order>, InferCreationAttributes<Order>> {
  @Column({ type: DataType.UUID, primaryKey: true, defaultValue: DataType.UUIDV4 })
  override id!: CreationOptional<string>;

  @ForeignKey(() => User)
  @Column({ type: DataType.UUID, allowNull: false })
  userId!: string;

  @ForeignKey(() => Event)
  @Column({ type: DataType.UUID, allowNull: false })
  eventId!: string;

  @Column({ type: DataType.UUID, allowNull: false })
  idempotencyKey!: string;

  @Column({ type: DataType.SMALLINT, allowNull: false })
  quantity!: number;

  @Column({ type: DataType.INTEGER, allowNull: false })
  unitPricePaise!: number;

  @Column({ type: DataType.INTEGER, allowNull: false })
  amountPaise!: number;

  @Column({ type: DataType.CHAR(3), allowNull: false, defaultValue: 'INR' })
  currency!: CreationOptional<'INR'>;

  @Column({
    type: DataType.STRING(20),
    allowNull: false,
    defaultValue: 'created',
    validate: { isIn: [[...ORDER_STATUSES]] },
  })
  status!: CreationOptional<OrderStatus>;

  @Column({ type: DataType.STRING(40), allowNull: true })
  razorpayOrderId!: CreationOptional<string | null>;

  @Column({ type: DataType.DATE, allowNull: false })
  expiresAt!: Date;

  @Column({ type: DataType.DATE, allowNull: true })
  paidAt!: CreationOptional<Date | null>;

  @CreatedAt
  override createdAt!: CreationOptional<Date>;

  @UpdatedAt
  override updatedAt!: CreationOptional<Date>;

  @BelongsTo(() => Event, { foreignKey: 'eventId', as: 'event' })
  event?: NonAttribute<Event>;
}
