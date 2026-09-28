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
import { GARBA_LEVELS, GENDERS, LIMITS, type GarbaLevel, type Gender } from '@garba-partner/shared';
import { Area } from './area.model.js';
import { City } from './city.model.js';
import { User } from './user.model.js';

/**
 * Personal profile (docs/users/user-profile.md). One row per user.
 * Private fields — `dateOfBirth` (only the age is shown), `instagramHandle` — are never exposed to
 * other members; see docs/users/privacy-rules.md. Hard-deleted on account erasure.
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

  @ForeignKey(() => City)
  @Column({ type: DataType.UUID, allowNull: false })
  cityId!: string;

  /** Must belong to `cityId` (composite foreign key). */
  @ForeignKey(() => Area)
  @Column({ type: DataType.UUID, allowNull: true })
  areaId!: CreationOptional<string | null>;

  @Column({
    type: DataType.STRING(LIMITS.BIO_MAX_LENGTH),
    allowNull: true,
    validate: { len: [0, LIMITS.BIO_MAX_LENGTH] },
  })
  bio!: CreationOptional<string | null>;

  /** Private. Lowercase, without `@`. */
  @Column({ type: DataType.STRING(30), allowNull: true, validate: { is: /^[a-z0-9._]{1,30}$/ } })
  instagramHandle!: CreationOptional<string | null>;

  @Column({
    type: DataType.STRING(20),
    allowNull: false,
    validate: { isIn: [[...GARBA_LEVELS]] },
  })
  garbaLevel!: GarbaLevel;

  /** `YYYY-MM-DD` dates, sorted ascending. */
  @Column({ type: DataType.ARRAY(DataType.DATEONLY), allowNull: false, defaultValue: [] })
  availableDates!: CreationOptional<string[]>;

  /** Cloudinary public ID (or local dev key) of the processed image. */
  @Column({ type: DataType.STRING(255), allowNull: true })
  imagePublicId!: CreationOptional<string | null>;

  @Column({ type: DataType.INTEGER, allowNull: true })
  imageWidth!: CreationOptional<number | null>;

  @Column({ type: DataType.INTEGER, allowNull: true })
  imageHeight!: CreationOptional<number | null>;

  @Column({ type: DataType.DATE, allowNull: true })
  imageUploadedAt!: CreationOptional<Date | null>;

  @CreatedAt
  override createdAt!: CreationOptional<Date>;

  @UpdatedAt
  override updatedAt!: CreationOptional<Date>;

  @BelongsTo(() => User, { foreignKey: 'userId', onDelete: 'CASCADE' })
  user?: NonAttribute<User>;

  @BelongsTo(() => City, { foreignKey: 'cityId' })
  city?: NonAttribute<City>;

  @BelongsTo(() => Area, { foreignKey: 'areaId' })
  area?: NonAttribute<Area | null>;
}
