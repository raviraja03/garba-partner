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
import { SESSION_REVOKE_REASONS, type SessionRevokeReason } from '@garba-partner/shared';
import { User } from './user.model.js';

const SHA256_HEX = /^[0-9a-f]{64}$/;

/**
 * One row per login (device). Only hashes of refresh tokens are stored; the token itself is
 * never persisted. Revocation is logical (`revoked_at`); expired/revoked rows are purged by a
 * scheduled job, so there is no soft delete. Token issuance arrives with the auth phase.
 */
@Table({ tableName: 'user_sessions' })
export class UserSession extends Model<
  InferAttributes<UserSession>,
  InferCreationAttributes<UserSession>
> {
  @Column({ type: DataType.UUID, primaryKey: true, defaultValue: DataType.UUIDV4 })
  override id!: CreationOptional<string>;

  @ForeignKey(() => User)
  @Column({ type: DataType.UUID, allowNull: false })
  userId!: string;

  /** SHA-256 (hex) of the current refresh token. */
  @Column({
    type: DataType.CHAR(64),
    allowNull: false,
    unique: 'user_sessions_refresh_token_hash_unique',
    validate: { is: SHA256_HEX },
  })
  refreshTokenHash!: string;

  /** SHA-256 (hex) of the previous refresh token, for reuse detection. */
  @Column({ type: DataType.CHAR(64), allowNull: true, validate: { is: SHA256_HEX } })
  previousRefreshTokenHash!: CreationOptional<string | null>;

  @Column({ type: DataType.DATE, allowNull: true })
  rotatedAt!: CreationOptional<Date | null>;

  @Column({ type: DataType.STRING(255), allowNull: true })
  userAgent!: CreationOptional<string | null>;

  /** HMAC of the client IP; raw IPs are not stored. */
  @Column({ type: DataType.CHAR(64), allowNull: true, validate: { is: SHA256_HEX } })
  ipHash!: CreationOptional<string | null>;

  @Column({ type: DataType.DATE, allowNull: false, defaultValue: DataType.NOW })
  lastUsedAt!: CreationOptional<Date>;

  /** Absolute expiry. */
  @Column({ type: DataType.DATE, allowNull: false })
  expiresAt!: Date;

  @Column({ type: DataType.DATE, allowNull: true })
  revokedAt!: CreationOptional<Date | null>;

  @Column({
    type: DataType.STRING(30),
    allowNull: true,
    validate: { isIn: [[...SESSION_REVOKE_REASONS]] },
  })
  revokedReason!: CreationOptional<SessionRevokeReason | null>;

  @CreatedAt
  override createdAt!: CreationOptional<Date>;

  @UpdatedAt
  override updatedAt!: CreationOptional<Date>;

  @BelongsTo(() => User, { foreignKey: 'userId', onDelete: 'CASCADE' })
  user?: NonAttribute<User>;
}
