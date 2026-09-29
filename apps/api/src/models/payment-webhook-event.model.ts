import type { CreationOptional, InferAttributes, InferCreationAttributes } from 'sequelize';
import { Column, DataType, Model, Table } from 'sequelize-typescript';

/** A Razorpay webhook event already received (idempotency: `event_id` = X-Razorpay-Event-Id). */
@Table({ tableName: 'payment_webhook_events', timestamps: false })
export class PaymentWebhookEvent extends Model<
  InferAttributes<PaymentWebhookEvent>,
  InferCreationAttributes<PaymentWebhookEvent>
> {
  @Column({ type: DataType.STRING(64), primaryKey: true })
  eventId!: string;

  @Column({ type: DataType.STRING(60), allowNull: false })
  event!: string;

  @Column({ type: DataType.STRING(40), allowNull: true })
  razorpayPaymentId!: CreationOptional<string | null>;

  @Column({ type: DataType.STRING(40), allowNull: true })
  razorpayOrderId!: CreationOptional<string | null>;

  @Column({ type: DataType.DATE, allowNull: false, defaultValue: DataType.NOW })
  receivedAt!: CreationOptional<Date>;

  @Column({ type: DataType.DATE, allowNull: true })
  processedAt!: CreationOptional<Date | null>;
}
