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
  LIMITS,
  PARTNER_GENDER_PREFERENCES,
  type PartnerGenderPreference,
} from '@garba-partner/shared';
import { User } from './user.model.js';

/**
 * Partner preferences and visibility settings. One row per user.
 * New members start visible: `discoveryEnabled` and `showArea` default to true. Both are shown
 * on the last onboarding step, where the member can turn them off, and can be changed at any
 * time. `verifiedOnly` stays off by default: it would hide every member who has not been
 * photo-verified yet. Hard-deleted on account erasure.
 */
@Table({
  tableName: 'user_preferences',
  validate: {
    ageRangeIsOrdered(this: UserPreference) {
      if (this.ageMin > this.ageMax) throw new Error('ageMin must be less than or equal to ageMax');
    },
  },
})
export class UserPreference extends Model<
  InferAttributes<UserPreference>,
  InferCreationAttributes<UserPreference>
> {
  @Column({ type: DataType.UUID, primaryKey: true, defaultValue: DataType.UUIDV4 })
  override id!: CreationOptional<string>;

  @ForeignKey(() => User)
  @Column({ type: DataType.UUID, allowNull: false, unique: 'user_preferences_user_id_unique' })
  userId!: string;

  @Column({
    type: DataType.STRING(20),
    allowNull: false,
    defaultValue: 'everyone',
    validate: { isIn: [[...PARTNER_GENDER_PREFERENCES]] },
  })
  partnerGenderPreference!: CreationOptional<PartnerGenderPreference>;

  @Column({
    type: DataType.SMALLINT,
    allowNull: false,
    defaultValue: LIMITS.PREF_AGE_MIN,
    validate: { min: LIMITS.PREF_AGE_MIN, max: LIMITS.PREF_AGE_MAX },
  })
  ageMin!: CreationOptional<number>;

  @Column({
    type: DataType.SMALLINT,
    allowNull: false,
    defaultValue: LIMITS.PREF_AGE_MAX,
    validate: { min: LIMITS.PREF_AGE_MIN, max: LIMITS.PREF_AGE_MAX },
  })
  ageMax!: CreationOptional<number>;

  /** Only show photo-verified members (applied by matching in a later phase). */
  @Column({ type: DataType.BOOLEAN, allowNull: false, defaultValue: false })
  verifiedOnly!: CreationOptional<boolean>;

  /** Whether the member can be found in partner discovery ("pause profile" when false). */
  @Column({ type: DataType.BOOLEAN, allowNull: false, defaultValue: true })
  discoveryEnabled!: CreationOptional<boolean>;

  /** Whether the neighbourhood area is shown on the profile (city is always shown). */
  @Column({ type: DataType.BOOLEAN, allowNull: false, defaultValue: true })
  showArea!: CreationOptional<boolean>;

  @CreatedAt
  override createdAt!: CreationOptional<Date>;

  @UpdatedAt
  override updatedAt!: CreationOptional<Date>;

  @BelongsTo(() => User, { foreignKey: 'userId', onDelete: 'CASCADE' })
  user?: NonAttribute<User>;
}
