import type {
  CreationOptional,
  InferAttributes,
  InferCreationAttributes,
  NonAttribute,
} from 'sequelize';
import {
  Column,
  CreatedAt,
  DataType,
  DefaultScope,
  HasMany,
  Model,
  Scopes,
  Table,
  UpdatedAt,
} from 'sequelize-typescript';
import {
  ADMIN_ROLES,
  ADMIN_STATUSES,
  type AdminRole,
  type AdminStatus,
} from '@garba-partner/shared';
import { AdminSession } from './admin-session.model.js';

/**
 * Admin panel identity — a separate table, login method and token audience from members.
 * Admins are disabled (`status`), never deleted, so audit references stay valid.
 * `passwordHash` and `totpSecretEncrypted` are excluded by default; load them only via
 * `AdminUser.scope('withSecrets')` (alias `withPassword`).
 */
@DefaultScope(() => ({ attributes: { exclude: ['passwordHash', 'totpSecretEncrypted'] } }))
@Scopes(() => ({ withPassword: {}, withSecrets: {} }))
@Table({ tableName: 'admin_users' })
export class AdminUser extends Model<
  InferAttributes<AdminUser>,
  InferCreationAttributes<AdminUser>
> {
  @Column({ type: DataType.UUID, primaryKey: true, defaultValue: DataType.UUIDV4 })
  override id!: CreationOptional<string>;

  /** Stored lowercase (enforced by a CHECK constraint). */
  @Column({
    type: DataType.STRING(254),
    allowNull: false,
    unique: 'admin_users_email_unique',
    validate: { isEmail: true, isLowercase: true },
  })
  email!: string;

  @Column({ type: DataType.STRING(100), allowNull: false, validate: { len: [1, 100] } })
  name!: string;

  @Column({ type: DataType.STRING(20), allowNull: false, validate: { isIn: [[...ADMIN_ROLES]] } })
  role!: AdminRole;

  /** Argon2id PHC string. */
  @Column({ type: DataType.TEXT, allowNull: false, validate: { is: /^\$argon2id\$/ } })
  passwordHash!: string;

  @Column({
    type: DataType.STRING(20),
    allowNull: false,
    defaultValue: 'active',
    validate: { isIn: [[...ADMIN_STATUSES]] },
  })
  status!: CreationOptional<AdminStatus>;

  @Column({ type: DataType.SMALLINT, allowNull: false, defaultValue: 0 })
  failedLoginCount!: CreationOptional<number>;

  @Column({ type: DataType.DATE, allowNull: true })
  lockedUntil!: CreationOptional<Date | null>;

  @Column({ type: DataType.DATE, allowNull: true })
  lastLoginAt!: CreationOptional<Date | null>;

  /** Authenticator secret, AES-256-GCM (TOTP_ENCRYPTION_KEY). Null until enrolled. */
  @Column({ type: DataType.TEXT, allowNull: true })
  totpSecretEncrypted!: CreationOptional<string | null>;

  @Column({ type: DataType.DATE, allowNull: true })
  totpEnabledAt!: CreationOptional<Date | null>;

  /** Last accepted 30-second step: codes at or before it are refused (no replay). */
  @Column({ type: DataType.BIGINT, allowNull: true })
  totpLastStep!: CreationOptional<string | number | null>;

  @CreatedAt
  override createdAt!: CreationOptional<Date>;

  @UpdatedAt
  override updatedAt!: CreationOptional<Date>;

  @HasMany(() => AdminSession, { foreignKey: 'adminId', onDelete: 'CASCADE' })
  sessions?: NonAttribute<AdminSession[]>;
}
