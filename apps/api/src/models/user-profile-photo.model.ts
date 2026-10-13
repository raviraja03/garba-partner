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
} from 'sequelize-typescript';
import { User } from './user.model.js';

/**
 * An extra profile photo. The main photo lives on `user_profiles.image_public_id`; these are the
 * additional ones shown on the profile page, oldest first. Hard-deleted on account erasure.
 */
@Table({ tableName: 'user_profile_photos', updatedAt: false })
export class UserProfilePhoto extends Model<
  InferAttributes<UserProfilePhoto>,
  InferCreationAttributes<UserProfilePhoto>
> {
  @Column({ type: DataType.UUID, primaryKey: true, defaultValue: DataType.UUIDV4 })
  override id!: CreationOptional<string>;

  @ForeignKey(() => User)
  @Column({ type: DataType.UUID, allowNull: false })
  userId!: string;

  /** Opaque storage ID. Never a URL: URLs are built by the media provider. */
  @Column({ type: DataType.STRING(255), allowNull: false, unique: true })
  publicId!: string;

  @Column({ type: DataType.INTEGER, allowNull: false })
  width!: number;

  @Column({ type: DataType.INTEGER, allowNull: false })
  height!: number;

  @CreatedAt
  override createdAt!: CreationOptional<Date>;

  @BelongsTo(() => User, { foreignKey: 'userId', onDelete: 'CASCADE' })
  user?: NonAttribute<User>;
}
