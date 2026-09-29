import type { CreationOptional, InferAttributes, InferCreationAttributes } from 'sequelize';
import {
  Column,
  CreatedAt,
  DataType,
  ForeignKey,
  Model,
  Table,
  UpdatedAt,
} from 'sequelize-typescript';
import {
  REPORT_REASONS,
  SANCTION_TYPES,
  type ReportReason,
  type SanctionType,
} from '@garba-partner/shared';
import { AdminUser } from './admin-user.model.js';
import { Report } from './report.model.js';
import { User } from './user.model.js';

/**
 * A moderator sanction (docs/safety/admin-actions.md). Never deleted: lifting sets `revokedAt`
 * (moderator) or `expiredAt` (a timed sanction ran out). `note` is internal and never shown to
 * the member.
 */
@Table({ tableName: 'user_sanctions' })
export class UserSanction extends Model<
  InferAttributes<UserSanction>,
  InferCreationAttributes<UserSanction>
> {
  @Column({ type: DataType.UUID, primaryKey: true, defaultValue: DataType.UUIDV4 })
  override id!: CreationOptional<string>;

  @ForeignKey(() => User)
  @Column({ type: DataType.UUID, allowNull: false })
  userId!: string;

  @Column({
    type: DataType.STRING(20),
    allowNull: false,
    validate: { isIn: [[...SANCTION_TYPES]] },
  })
  type!: SanctionType;

  @Column({
    type: DataType.STRING(30),
    allowNull: false,
    validate: { isIn: [[...REPORT_REASONS]] },
  })
  reasonCode!: ReportReason;

  @Column({ type: DataType.TEXT, allowNull: false })
  note!: string;

  @ForeignKey(() => Report)
  @Column({ type: DataType.UUID, allowNull: true })
  reportId!: CreationOptional<string | null>;

  @Column({ type: DataType.DATE, allowNull: false, defaultValue: DataType.NOW })
  startsAt!: CreationOptional<Date>;

  @Column({ type: DataType.DATE, allowNull: true })
  endsAt!: CreationOptional<Date | null>;

  @ForeignKey(() => AdminUser)
  @Column({ type: DataType.UUID, allowNull: false })
  createdByAdminId!: string;

  @Column({ type: DataType.DATE, allowNull: true })
  acknowledgedAt!: CreationOptional<Date | null>;

  @Column({ type: DataType.DATE, allowNull: true })
  revokedAt!: CreationOptional<Date | null>;

  @ForeignKey(() => AdminUser)
  @Column({ type: DataType.UUID, allowNull: true })
  revokedByAdminId!: CreationOptional<string | null>;

  @Column({ type: DataType.STRING(500), allowNull: true })
  revokeReason!: CreationOptional<string | null>;

  @Column({ type: DataType.DATE, allowNull: true })
  expiredAt!: CreationOptional<Date | null>;

  @CreatedAt
  override createdAt!: CreationOptional<Date>;

  @UpdatedAt
  override updatedAt!: CreationOptional<Date>;
}
