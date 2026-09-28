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
import { ADMIN_SESSION_REVOKE_REASONS, type AdminSessionRevokeReason } from '@garba-partner/shared';
import { AdminUser } from './admin-user.model.js';

const SHA256_HEX = /^[0-9a-f]{64}$/;

/** One row per admin login. Same token strategy as member sessions, plus an idle timeout. */
@Table({ tableName: 'admin_sessions' })
export class AdminSession extends Model<
  InferAttributes<AdminSession>,
  InferCreationAttributes<AdminSession>
> {
  @Column({ type: DataType.UUID, primaryKey: true, defaultValue: DataType.UUIDV4 })
  override id!: CreationOptional<string>;

  @ForeignKey(() => AdminUser)
  @Column({ type: DataType.UUID, allowNull: false })
  adminId!: string;

  @Column({
    type: DataType.CHAR(64),
    allowNull: false,
    unique: 'admin_sessions_refresh_token_hash_unique',
    validate: { is: SHA256_HEX },
  })
  refreshTokenHash!: string;

  @Column({ type: DataType.CHAR(64), allowNull: true, validate: { is: SHA256_HEX } })
  previousRefreshTokenHash!: CreationOptional<string | null>;

  @Column({ type: DataType.DATE, allowNull: true })
  rotatedAt!: CreationOptional<Date | null>;

  @Column({ type: DataType.STRING(255), allowNull: true })
  userAgent!: CreationOptional<string | null>;

  @Column({ type: DataType.CHAR(64), allowNull: true, validate: { is: SHA256_HEX } })
  ipHash!: CreationOptional<string | null>;

  @Column({ type: DataType.DATE, allowNull: false, defaultValue: DataType.NOW })
  lastUsedAt!: CreationOptional<Date>;

  @Column({ type: DataType.DATE, allowNull: false })
  expiresAt!: Date;

  @Column({ type: DataType.DATE, allowNull: true })
  revokedAt!: CreationOptional<Date | null>;

  @Column({
    type: DataType.STRING(30),
    allowNull: true,
    validate: { isIn: [[...ADMIN_SESSION_REVOKE_REASONS]] },
  })
  revokedReason!: CreationOptional<AdminSessionRevokeReason | null>;

  @CreatedAt
  override createdAt!: CreationOptional<Date>;

  @UpdatedAt
  override updatedAt!: CreationOptional<Date>;

  @BelongsTo(() => AdminUser, { foreignKey: 'adminId', onDelete: 'CASCADE' })
  admin?: NonAttribute<AdminUser>;
}
