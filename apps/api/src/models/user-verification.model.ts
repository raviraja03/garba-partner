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
import {
  VERIFICATION_FAILURE_REASONS,
  VERIFICATION_PROVIDERS,
  VERIFICATION_STATUSES,
  VERIFICATION_TYPES,
  type VerificationFailureReason,
  type VerificationProvider,
  type VerificationStatus,
  type VerificationType,
} from '@garba-partner/shared';
import { containsAadhaarLikeNumber } from '../lib/pii-guards.js';
import { User } from './user.model.js';

function rejectAadhaarLikeValue(value: unknown): void {
  if (typeof value === 'string' && containsAadhaarLikeNumber(value)) {
    throw new Error('Identity document numbers must never be stored');
  }
}

/**
 * Verification attempts. Stores ONLY provider / reference / status metadata:
 * no document numbers (Aadhaar or otherwise), no document images, no KYC payloads,
 * no free-text notes. `evidenceReference` is an opaque pointer to privately stored evidence
 * (e.g. a private selfie asset) that is deleted after the retention period.
 * Rows are kept as an audit trail; they are removed only when the account is erased.
 */
@Table({ tableName: 'user_verifications' })
export class UserVerification extends Model<
  InferAttributes<UserVerification>,
  InferCreationAttributes<UserVerification>
> {
  @Column({ type: DataType.UUID, primaryKey: true, defaultValue: DataType.UUIDV4 })
  override id!: CreationOptional<string>;

  @ForeignKey(() => User)
  @Column({ type: DataType.UUID, allowNull: false })
  userId!: string;

  @Column({
    type: DataType.STRING(20),
    allowNull: false,
    validate: { isIn: [[...VERIFICATION_TYPES]] },
  })
  type!: VerificationType;

  @Column({
    type: DataType.STRING(40),
    allowNull: false,
    validate: { isIn: [[...VERIFICATION_PROVIDERS]] },
  })
  provider!: VerificationProvider;

  /** Reference ID issued by an external provider (never a document number). */
  @Column({
    type: DataType.STRING(100),
    allowNull: true,
    validate: { noIdentityNumbers: rejectAadhaarLikeValue },
  })
  providerReference!: CreationOptional<string | null>;

  @Column({
    type: DataType.STRING(20),
    allowNull: false,
    defaultValue: 'initiated',
    validate: { isIn: [[...VERIFICATION_STATUSES]] },
  })
  status!: CreationOptional<VerificationStatus>;

  /** Challenge issued to the member (e.g. the gesture code for photo verification). */
  @Column({ type: DataType.STRING(40), allowNull: true, validate: { is: /^[a-z0-9_]{1,40}$/ } })
  challengeCode!: CreationOptional<string | null>;

  /** Opaque pointer to private evidence; nulled when the evidence is purged. */
  @Column({
    type: DataType.STRING(255),
    allowNull: true,
    validate: { noIdentityNumbers: rejectAadhaarLikeValue },
  })
  evidenceReference!: CreationOptional<string | null>;

  @Column({ type: DataType.DATE, allowNull: true })
  evidenceDeletedAt!: CreationOptional<Date | null>;

  @Column({
    type: DataType.STRING(30),
    allowNull: true,
    validate: { isIn: [[...VERIFICATION_FAILURE_REASONS]] },
  })
  failureReason!: CreationOptional<VerificationFailureReason | null>;

  @Column({ type: DataType.DATE, allowNull: true })
  submittedAt!: CreationOptional<Date | null>;

  @Column({ type: DataType.DATE, allowNull: true })
  decidedAt!: CreationOptional<Date | null>;

  @Column({ type: DataType.DATE, allowNull: true })
  expiresAt!: CreationOptional<Date | null>;

  /** Admin who decided a manual review. FK to `admin_users` is added in the admin phase. */
  @Column({ type: DataType.UUID, allowNull: true })
  reviewedByAdminId!: CreationOptional<string | null>;

  @CreatedAt
  override createdAt!: CreationOptional<Date>;

  @UpdatedAt
  override updatedAt!: CreationOptional<Date>;

  @BelongsTo(() => User, { foreignKey: 'userId', onDelete: 'CASCADE' })
  user?: NonAttribute<User>;
}
