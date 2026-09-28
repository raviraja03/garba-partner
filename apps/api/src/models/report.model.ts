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
  REPORT_REASONS,
  REPORT_RESOLUTION_ACTIONS,
  REPORT_SOURCES,
  REPORT_STATUSES,
  type ReportReason,
  type ReportResolutionAction,
  type ReportSource,
  type ReportStatus,
} from '@garba-partner/shared';
import { AdminUser } from './admin-user.model.js';
import { User } from './user.model.js';

/** Snapshot of the reported member's public profile at report time. */
export interface ReportEvidence {
  profile?: { name: string; bio: string | null; imagePublicId: string | null } | null;
  /** System reports: what triggered them (e.g. `identity_verification`). */
  trigger?: string;
}

/** A report about a member (docs/safety/reporting.md). */
@Table({ tableName: 'reports' })
export class Report extends Model<InferAttributes<Report>, InferCreationAttributes<Report>> {
  @Column({ type: DataType.UUID, primaryKey: true, defaultValue: DataType.UUIDV4 })
  override id!: CreationOptional<string>;

  @Column({
    type: DataType.STRING(10),
    allowNull: false,
    defaultValue: 'member',
    validate: { isIn: [[...REPORT_SOURCES]] },
  })
  source!: CreationOptional<ReportSource>;

  @ForeignKey(() => User)
  @Column({ type: DataType.UUID, allowNull: true })
  reporterId!: string | null;

  @ForeignKey(() => User)
  @Column({ type: DataType.UUID, allowNull: false })
  reportedUserId!: string;

  @Column({ type: DataType.STRING(30), allowNull: false, validate: { isIn: [[...REPORT_REASONS]] } })
  reason!: ReportReason;

  @Column({ type: DataType.SMALLINT, allowNull: false, validate: { min: 0, max: 2 } })
  priority!: 0 | 1 | 2;

  @Column({ type: DataType.STRING(1000), allowNull: true })
  details!: CreationOptional<string | null>;

  @Column({ type: DataType.JSONB, allowNull: false, defaultValue: {} })
  evidence!: CreationOptional<ReportEvidence>;

  @Column({
    type: DataType.STRING(20),
    allowNull: false,
    defaultValue: 'open',
    validate: { isIn: [[...REPORT_STATUSES]] },
  })
  status!: CreationOptional<ReportStatus>;

  @ForeignKey(() => AdminUser)
  @Column({ type: DataType.UUID, allowNull: true })
  assignedAdminId!: CreationOptional<string | null>;

  @Column({
    type: DataType.STRING(20),
    allowNull: true,
    validate: { isIn: [[...REPORT_RESOLUTION_ACTIONS]] },
  })
  resolutionAction!: CreationOptional<ReportResolutionAction | null>;

  @Column({ type: DataType.TEXT, allowNull: true })
  resolutionNote!: CreationOptional<string | null>;

  @ForeignKey(() => AdminUser)
  @Column({ type: DataType.UUID, allowNull: true })
  resolvedByAdminId!: CreationOptional<string | null>;

  @Column({ type: DataType.DATE, allowNull: true })
  resolvedAt!: CreationOptional<Date | null>;

  @CreatedAt
  override createdAt!: CreationOptional<Date>;

  @UpdatedAt
  override updatedAt!: CreationOptional<Date>;

  @BelongsTo(() => User, { foreignKey: 'reportedUserId', as: 'reportedUser' })
  reportedUser?: NonAttribute<User>;

  @BelongsTo(() => User, { foreignKey: 'reporterId', as: 'reporter' })
  reporter?: NonAttribute<User | null>;
}
