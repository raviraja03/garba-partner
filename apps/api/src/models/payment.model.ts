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
import {
  PAYMENT_STATUSES,
  REFUND_STATUSES,
  type PaymentStatus,
  type RefundStatus,
} from '@garba-partner/shared';
import { Order } from './order.model.js';

/**
 * A Razorpay payment as verified by the server. Only what bookings, refunds and support need:
 * never card numbers, UPI IDs, emails or phone numbers.
 */
@Table({ tableName: 'payments' })
export class Payment extends Model<InferAttributes<Payment>, InferCreationAttributes<Payment>> {
  @Column({ type: DataType.UUID, primaryKey: true, defaultValue: DataType.UUIDV4 })
  override id!: CreationOptional<string>;

  @ForeignKey(() => Order)
  @Column({ type: DataType.UUID, allowNull: false })
  orderId!: string;

  @Column({ type: DataType.STRING(40), allowNull: false })
  razorpayPaymentId!: string;

  @Column({
    type: DataType.STRING(20),
    allowNull: false,
    validate: { isIn: [[...PAYMENT_STATUSES]] },
  })
  status!: PaymentStatus;

  @Column({ type: DataType.INTEGER, allowNull: false })
  amountPaise!: number;

  @Column({ type: DataType.CHAR(3), allowNull: false })
  currency!: string;

  @Column({ type: DataType.STRING(20), allowNull: true })
  method!: CreationOptional<string | null>;

  @Column({ type: DataType.STRING(60), allowNull: true })
  errorCode!: CreationOptional<string | null>;

  @Column({ type: DataType.STRING(255), allowNull: true })
  errorReason!: CreationOptional<string | null>;

  @Column({ type: DataType.DATE, allowNull: true })
  capturedAt!: CreationOptional<Date | null>;

  @Column({
    type: DataType.STRING(20),
    allowNull: false,
    defaultValue: 'none',
    validate: { isIn: [[...REFUND_STATUSES]] },
  })
  refundStatus!: CreationOptional<RefundStatus>;

  @Column({ type: DataType.STRING(40), allowNull: true })
  razorpayRefundId!: CreationOptional<string | null>;

  @Column({ type: DataType.INTEGER, allowNull: false, defaultValue: 0 })
  amountRefundedPaise!: CreationOptional<number>;

  @Column({ type: DataType.DATE, allowNull: true })
  refundedAt!: CreationOptional<Date | null>;

  @CreatedAt
  override createdAt!: CreationOptional<Date>;

  @UpdatedAt
  override updatedAt!: CreationOptional<Date>;
}
