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
import { ORGANIZER_STATUSES, type OrganizerStatus } from '@garba-partner/shared';
import { AdminUser } from './admin-user.model.js';

/**
 * Attributes safe to show members. Contact fields and notes are PRIVATE: load them only in admin
 * code paths (docs/events/organizer-management.md).
 */
export const ORGANIZER_PUBLIC_ATTRIBUTES = [
  'id',
  'name',
  'description',
  'websiteUrl',
  'instagramHandle',
  'isVerified',
] as const;

/** An event organizer. Archived, never deleted (events reference it). */
@Table({ tableName: 'event_organizers' })
export class EventOrganizer extends Model<
  InferAttributes<EventOrganizer>,
  InferCreationAttributes<EventOrganizer>
> {
  @Column({ type: DataType.UUID, primaryKey: true, defaultValue: DataType.UUIDV4 })
  override id!: CreationOptional<string>;

  @Column({ type: DataType.STRING(150), allowNull: false })
  name!: string;

  @Column({ type: DataType.STRING(1000), allowNull: true })
  description!: CreationOptional<string | null>;

  @Column({ type: DataType.STRING(500), allowNull: true })
  websiteUrl!: CreationOptional<string | null>;

  @Column({ type: DataType.STRING(30), allowNull: true })
  instagramHandle!: CreationOptional<string | null>;

  /** PRIVATE */
  @Column({ type: DataType.STRING(100), allowNull: true })
  contactName!: CreationOptional<string | null>;

  /** PRIVATE */
  @Column({ type: DataType.STRING(254), allowNull: true })
  contactEmail!: CreationOptional<string | null>;

  /** PRIVATE */
  @Column({ type: DataType.STRING(40), allowNull: true })
  contactPhone!: CreationOptional<string | null>;

  /** PRIVATE (internal admin notes) */
  @Column({ type: DataType.STRING(2000), allowNull: true })
  notes!: CreationOptional<string | null>;

  @Column({
    type: DataType.STRING(20),
    allowNull: false,
    defaultValue: 'active',
    validate: { isIn: [[...ORGANIZER_STATUSES]] },
  })
  status!: CreationOptional<OrganizerStatus>;

  @Column({ type: DataType.BOOLEAN, allowNull: false, defaultValue: false })
  isVerified!: CreationOptional<boolean>;

  @Column({ type: DataType.DATE, allowNull: true })
  verifiedAt!: CreationOptional<Date | null>;

  @Column({ type: DataType.DATE, allowNull: true })
  archivedAt!: CreationOptional<Date | null>;

  @ForeignKey(() => AdminUser)
  @Column({ type: DataType.UUID, allowNull: false })
  createdByAdminId!: string;

  @ForeignKey(() => AdminUser)
  @Column({ type: DataType.UUID, allowNull: false })
  updatedByAdminId!: string;

  @CreatedAt
  override createdAt!: CreationOptional<Date>;

  @UpdatedAt
  override updatedAt!: CreationOptional<Date>;

  @BelongsTo(() => AdminUser, { foreignKey: 'createdByAdminId', as: 'createdBy' })
  createdBy?: NonAttribute<AdminUser>;
}
