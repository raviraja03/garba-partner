import type { CreationOptional, InferAttributes, InferCreationAttributes } from 'sequelize';
import { Column, CreatedAt, DataType, ForeignKey, Model, Table } from 'sequelize-typescript';
import { AdminUser } from './admin-user.model.js';
import { User } from './user.model.js';

/**
 * One API request (docs/development/logging.md). Append-only. Never holds request or response
 * bodies, headers, cookies or query strings.
 */
@Table({ tableName: 'api_logs', updatedAt: false })
export class ApiLog extends Model<InferAttributes<ApiLog>, InferCreationAttributes<ApiLog>> {
  @Column({ type: DataType.UUID, primaryKey: true, defaultValue: DataType.UUIDV4 })
  override id!: CreationOptional<string>;

  @Column({ type: DataType.STRING(64), allowNull: false })
  requestId!: string;

  @ForeignKey(() => User)
  @Column({ type: DataType.UUID, allowNull: true })
  userId!: string | null;

  @ForeignKey(() => AdminUser)
  @Column({ type: DataType.UUID, allowNull: true })
  adminId!: string | null;

  @Column({ type: DataType.STRING(10), allowNull: false })
  method!: string;

  /** Path only: the query string is dropped (it can carry phone numbers and tokens). */
  @Column({ type: DataType.STRING(255), allowNull: false })
  endpoint!: string;

  @Column({ type: DataType.SMALLINT, allowNull: false })
  statusCode!: number;

  @Column({ type: DataType.INTEGER, allowNull: false })
  responseTimeMs!: number;

  @Column({ type: DataType.INET, allowNull: true })
  ipAddress!: string | null;

  @Column({ type: DataType.STRING(255), allowNull: true })
  userAgent!: string | null;

  @Column({ type: DataType.DATE, allowNull: false })
  requestTimestamp!: Date;

  @Column({ type: DataType.DATE, allowNull: false })
  responseTimestamp!: Date;

  @Column({ type: DataType.BOOLEAN, allowNull: false })
  success!: boolean;

  @Column({ type: DataType.STRING(40), allowNull: true })
  errorCode!: string | null;

  @Column({ type: DataType.STRING(300), allowNull: true })
  errorMessage!: string | null;

  @CreatedAt
  override createdAt!: CreationOptional<Date>;
}
