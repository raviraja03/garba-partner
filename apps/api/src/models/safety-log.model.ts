import type { CreationOptional, InferAttributes, InferCreationAttributes } from 'sequelize';
import { Column, CreatedAt, DataType, Model, Table } from 'sequelize-typescript';
import {
  SAFETY_EVENT_TYPES,
  SAFETY_SEVERITIES,
  type SafetyEventType,
  type SafetySeverity,
} from '@garba-partner/shared';

/**
 * Suspicious-activity log (append-only; a trigger rejects UPDATE/DELETE). `userId`/`adminId` are
 * plain references without foreign keys so entries survive account erasure.
 */
@Table({ tableName: 'safety_logs', updatedAt: false })
export class SafetyLog extends Model<
  InferAttributes<SafetyLog>,
  InferCreationAttributes<SafetyLog>
> {
  @Column({ type: DataType.UUID, primaryKey: true, defaultValue: DataType.UUIDV4 })
  override id!: CreationOptional<string>;

  @Column({
    type: DataType.STRING(60),
    allowNull: false,
    validate: { isIn: [[...SAFETY_EVENT_TYPES]] },
  })
  eventType!: SafetyEventType;

  @Column({
    type: DataType.STRING(10),
    allowNull: false,
    validate: { isIn: [[...SAFETY_SEVERITIES]] },
  })
  severity!: SafetySeverity;

  @Column({ type: DataType.UUID, allowNull: true })
  userId!: CreationOptional<string | null>;

  @Column({ type: DataType.UUID, allowNull: true })
  adminId!: CreationOptional<string | null>;

  @Column({ type: DataType.CHAR(64), allowNull: true })
  ipHash!: CreationOptional<string | null>;

  @Column({ type: DataType.JSONB, allowNull: false, defaultValue: {} })
  metadata!: CreationOptional<Record<string, unknown>>;

  @CreatedAt
  override createdAt!: CreationOptional<Date>;
}
