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
  DeletedAt,
  HasMany,
  HasOne,
  Model,
  Scopes,
  Table,
  UpdatedAt,
} from 'sequelize-typescript';
import {
  HIDDEN_REASONS,
  USER_STATUSES,
  type HiddenReason,
  type UserStatus,
} from '@garba-partner/shared';
import { UserPreference } from './user-preference.model.js';
import { UserProfile } from './user-profile.model.js';
import { UserSession } from './user-session.model.js';
import { UserVerification } from './user-verification.model.js';

/** Phone columns are excluded by default; load them only via `User.scope('withPhone')`. */
export const USER_PHONE_ATTRIBUTES = ['phoneHash', 'phoneEncrypted', 'phoneKeyVersion'] as const;

/**
 * Account record. Personal details live in `user_profiles`; settings in `user_preferences`.
 *
 * Soft delete (`paranoid`): `deleted_at` marks an erased account. The database requires phone
 * data to be nulled in the same update (constraint `users_phone_lifecycle_check`), so a plain
 * `destroy()` fails on purpose — erasure must go through the account-deletion service.
 */
@DefaultScope(() => ({ attributes: { exclude: [...USER_PHONE_ATTRIBUTES] } }))
@Scopes(() => ({ withPhone: {} }))
@Table({ tableName: 'users', paranoid: true })
export class User extends Model<InferAttributes<User>, InferCreationAttributes<User>> {
  @Column({ type: DataType.UUID, primaryKey: true, defaultValue: DataType.UUIDV4 })
  override id!: CreationOptional<string>;

  /** HMAC-SHA256 of the E.164 number (hex). Lookup key; never the number itself. */
  @Column({ type: DataType.CHAR(64), allowNull: true, validate: { is: /^[0-9a-f]{64}$/ } })
  phoneHash!: string | null;

  /** AES-256-GCM ciphertext of the number, for audited break-glass access only. */
  @Column({ type: DataType.TEXT, allowNull: true })
  phoneEncrypted!: string | null;

  @Column({ type: DataType.SMALLINT, allowNull: true, validate: { min: 1 } })
  phoneKeyVersion!: number | null;

  @Column({
    type: DataType.STRING(20),
    allowNull: false,
    defaultValue: 'active',
    validate: { isIn: [[...USER_STATUSES]] },
  })
  status!: CreationOptional<UserStatus>;

  @Column({ type: DataType.DATE, allowNull: true })
  onboardingCompletedAt!: CreationOptional<Date | null>;

  @Column({ type: DataType.DATE, allowNull: true })
  underageRejectedAt!: CreationOptional<Date | null>;

  @Column({ type: DataType.DATE, allowNull: true })
  photoVerifiedAt!: CreationOptional<Date | null>;

  @Column({ type: DataType.BOOLEAN, allowNull: false, defaultValue: false })
  hiddenFromDiscovery!: CreationOptional<boolean>;

  @Column({
    type: DataType.STRING(30),
    allowNull: true,
    validate: { isIn: [[...HIDDEN_REASONS]] },
  })
  hiddenReason!: CreationOptional<HiddenReason | null>;

  @Column({ type: DataType.STRING(20), allowNull: true })
  termsVersion!: CreationOptional<string | null>;

  @Column({ type: DataType.DATE, allowNull: true })
  termsAcceptedAt!: CreationOptional<Date | null>;

  @Column({ type: DataType.DATE, allowNull: true })
  lastActiveAt!: CreationOptional<Date | null>;

  @Column({ type: DataType.DATE, allowNull: true })
  deletionRequestedAt!: CreationOptional<Date | null>;

  @CreatedAt
  override createdAt!: CreationOptional<Date>;

  @UpdatedAt
  override updatedAt!: CreationOptional<Date>;

  @DeletedAt
  override deletedAt!: CreationOptional<Date | null>;

  @HasOne(() => UserProfile, { foreignKey: 'userId', onDelete: 'CASCADE' })
  profile?: NonAttribute<UserProfile | null>;

  @HasOne(() => UserPreference, { foreignKey: 'userId', onDelete: 'CASCADE' })
  preferences?: NonAttribute<UserPreference | null>;

  @HasMany(() => UserSession, { foreignKey: 'userId', onDelete: 'CASCADE' })
  sessions?: NonAttribute<UserSession[]>;

  @HasMany(() => UserVerification, { foreignKey: 'userId', onDelete: 'CASCADE' })
  verifications?: NonAttribute<UserVerification[]>;
}
