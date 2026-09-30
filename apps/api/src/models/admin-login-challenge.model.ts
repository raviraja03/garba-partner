import type { CreationOptional, InferAttributes, InferCreationAttributes } from 'sequelize';
import { Column, CreatedAt, DataType, ForeignKey, Model, Table } from 'sequelize-typescript';
import { AdminUser } from './admin-user.model.js';

/**
 * The second sign-in step after a correct admin password (docs/security/security-best-practices.md).
 * Only a hash of the challenge token is stored; challenges expire after 5 minutes and 5 attempts.
 */
@Table({ tableName: 'admin_login_challenges', updatedAt: false })
export class AdminLoginChallenge extends Model<
  InferAttributes<AdminLoginChallenge>,
  InferCreationAttributes<AdminLoginChallenge>
> {
  @Column({ type: DataType.UUID, primaryKey: true, defaultValue: DataType.UUIDV4 })
  override id!: CreationOptional<string>;

  @ForeignKey(() => AdminUser)
  @Column({ type: DataType.UUID, allowNull: false })
  adminId!: string;

  @Column({ type: DataType.CHAR(64), allowNull: false })
  tokenHash!: string;

  @Column({ type: DataType.STRING(10), allowNull: false, validate: { isIn: [['totp', 'setup']] } })
  purpose!: 'totp' | 'setup';

  /** `setup` only: the new secret (encrypted) until the first code confirms it. */
  @Column({ type: DataType.TEXT, allowNull: true })
  pendingSecretEncrypted!: CreationOptional<string | null>;

  @Column({ type: DataType.SMALLINT, allowNull: false, defaultValue: 0 })
  attempts!: CreationOptional<number>;

  @Column({ type: DataType.DATE, allowNull: false })
  expiresAt!: Date;

  @Column({ type: DataType.DATE, allowNull: true })
  consumedAt!: CreationOptional<Date | null>;

  @CreatedAt
  override createdAt!: CreationOptional<Date>;
}
