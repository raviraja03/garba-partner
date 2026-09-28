import type { CreationOptional, InferAttributes, InferCreationAttributes } from 'sequelize';
import { Column, CreatedAt, DataType, Model, Table, UpdatedAt } from 'sequelize-typescript';

const SHA256_HEX = /^[0-9a-f]{64}$/;

/**
 * One-time login codes. Only an HMAC of the code is stored (`otpHash`); the code itself is never
 * persisted or logged. A new request invalidates the previous active code for the same phone.
 * Rows are purged after 24 hours by a scheduled job.
 */
@Table({ tableName: 'otp_requests' })
export class OtpRequest extends Model<
  InferAttributes<OtpRequest>,
  InferCreationAttributes<OtpRequest>
> {
  @Column({ type: DataType.UUID, primaryKey: true, defaultValue: DataType.UUIDV4 })
  override id!: CreationOptional<string>;

  @Column({ type: DataType.CHAR(64), allowNull: false, validate: { is: SHA256_HEX } })
  phoneHash!: string;

  @Column({ type: DataType.CHAR(64), allowNull: false, validate: { is: SHA256_HEX } })
  otpHash!: string;

  @Column({ type: DataType.SMALLINT, allowNull: false, defaultValue: 0, validate: { min: 0 } })
  attempts!: CreationOptional<number>;

  @Column({ type: DataType.DATE, allowNull: false })
  expiresAt!: Date;

  @Column({ type: DataType.DATE, allowNull: true })
  consumedAt!: CreationOptional<Date | null>;

  @Column({ type: DataType.DATE, allowNull: true })
  invalidatedAt!: CreationOptional<Date | null>;

  /** HMAC of the requesting client IP (for per-IP rate limits); raw IPs are not stored. */
  @Column({ type: DataType.CHAR(64), allowNull: false, validate: { is: SHA256_HEX } })
  ipHash!: string;

  @CreatedAt
  override createdAt!: CreationOptional<Date>;

  @UpdatedAt
  override updatedAt!: CreationOptional<Date>;
}
