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
  DANCE_STYLES,
  EXPERIENCE_LEVELS,
  GENDERS,
  LIMITS,
  type DanceStyle,
  type ExperienceLevel,
  type Gender,
} from '@garba-partner/shared';
import { User } from './user.model.js';

/**
 * Personal profile shown (partially) to other members. One row per user.
 * Hard-deleted when an account is erased (no soft delete: the data is personal and not needed
 * after erasure). `date_of_birth` is never exposed to other members; only the computed age is.
 * City/area columns are added with the locations migration.
 */
@Table({ tableName: 'user_profiles' })
export class UserProfile extends Model<
  InferAttributes<UserProfile>,
  InferCreationAttributes<UserProfile>
> {
  @Column({ type: DataType.UUID, primaryKey: true, defaultValue: DataType.UUIDV4 })
  override id!: CreationOptional<string>;

  @ForeignKey(() => User)
  @Column({ type: DataType.UUID, allowNull: false, unique: 'user_profiles_user_id_unique' })
  userId!: string;

  @Column({
    type: DataType.STRING(LIMITS.DISPLAY_NAME_MAX),
    allowNull: false,
    validate: { len: [LIMITS.DISPLAY_NAME_MIN, LIMITS.DISPLAY_NAME_MAX] },
  })
  displayName!: string;

  /** `YYYY-MM-DD`. Immutable through the API (changes go through support). */
  @Column({ type: DataType.DATEONLY, allowNull: false, validate: { isDate: true } })
  dateOfBirth!: string;

  @Column({ type: DataType.STRING(20), allowNull: false, validate: { isIn: [[...GENDERS]] } })
  gender!: Gender;

  @Column({
    type: DataType.STRING(LIMITS.BIO_MAX_LENGTH),
    allowNull: true,
    validate: { len: [0, LIMITS.BIO_MAX_LENGTH] },
  })
  bio!: CreationOptional<string | null>;

  @Column({
    type: DataType.STRING(20),
    allowNull: false,
    validate: { isIn: [[...EXPERIENCE_LEVELS]] },
  })
  experience!: ExperienceLevel;

  @Column({
    type: DataType.ARRAY(DataType.STRING(20)),
    allowNull: false,
    validate: {
      isValidStyleList(value: unknown) {
        const allowed: readonly string[] = DANCE_STYLES;
        if (
          !Array.isArray(value) ||
          value.length === 0 ||
          new Set(value).size !== value.length ||
          !value.every((style) => typeof style === 'string' && allowed.includes(style))
        ) {
          throw new Error(`styles must be a non-empty list of: ${DANCE_STYLES.join(', ')}`);
        }
      },
    },
  })
  styles!: DanceStyle[];

  @CreatedAt
  override createdAt!: CreationOptional<Date>;

  @UpdatedAt
  override updatedAt!: CreationOptional<Date>;

  @BelongsTo(() => User, { foreignKey: 'userId', onDelete: 'CASCADE' })
  user?: NonAttribute<User>;
}
