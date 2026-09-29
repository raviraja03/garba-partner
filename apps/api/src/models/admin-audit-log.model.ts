import type { CreationOptional, InferAttributes, InferCreationAttributes } from 'sequelize';
import { Column, CreatedAt, DataType, ForeignKey, Model, Table } from 'sequelize-typescript';
import { AdminUser } from './admin-user.model.js';

export const AUDIT_TARGET_TYPES = [
  'user',
  'admin',
  'report',
  'event',
  'verification',
  'photo',
  'city',
  'area',
  'sanction',
  'organizer',
] as const;
export type AuditTargetType = (typeof AUDIT_TARGET_TYPES)[number];

/**
 * Append-only admin action log (a database trigger rejects UPDATE/DELETE).
 * `metadata` must never contain phone numbers, OTPs, passwords or tokens.
 */
@Table({ tableName: 'admin_audit_logs', updatedAt: false })
export class AdminAuditLog extends Model<
  InferAttributes<AdminAuditLog>,
  InferCreationAttributes<AdminAuditLog>
> {
  @Column({ type: DataType.UUID, primaryKey: true, defaultValue: DataType.UUIDV4 })
  override id!: CreationOptional<string>;

  @ForeignKey(() => AdminUser)
  @Column({ type: DataType.UUID, allowNull: false })
  adminId!: string;

  /** Dotted, e.g. `user.suspend`. */
  @Column({
    type: DataType.STRING(60),
    allowNull: false,
    validate: { is: /^[a-z_]+(\.[a-z_]+)+$/ },
  })
  action!: string;

  @Column({
    type: DataType.STRING(30),
    allowNull: false,
    validate: { isIn: [[...AUDIT_TARGET_TYPES]] },
  })
  targetType!: AuditTargetType;

  @Column({ type: DataType.UUID, allowNull: true })
  targetId!: CreationOptional<string | null>;

  @Column({ type: DataType.JSONB, allowNull: false, defaultValue: {} })
  metadata!: CreationOptional<Record<string, unknown>>;

  @Column({ type: DataType.CHAR(64), allowNull: true })
  ipHash!: CreationOptional<string | null>;

  @CreatedAt
  override createdAt!: CreationOptional<Date>;
}
