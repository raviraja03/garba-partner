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
import { INTEREST_STATUSES, type InterestStatus } from '@garba-partner/shared';
import { Event } from './event.model.js';
import { User } from './user.model.js';

/** An interest from one member to another (docs/matching/interests.md). */
@Table({ tableName: 'partner_interests' })
export class PartnerInterest extends Model<
  InferAttributes<PartnerInterest>,
  InferCreationAttributes<PartnerInterest>
> {
  @Column({ type: DataType.UUID, primaryKey: true, defaultValue: DataType.UUIDV4 })
  override id!: CreationOptional<string>;

  @ForeignKey(() => User)
  @Column({ type: DataType.UUID, allowNull: false })
  senderId!: string;

  @ForeignKey(() => User)
  @Column({ type: DataType.UUID, allowNull: false })
  receiverId!: string;

  @ForeignKey(() => Event)
  @Column({ type: DataType.UUID, allowNull: true })
  eventId!: CreationOptional<string | null>;

  @Column({
    type: DataType.STRING(20),
    allowNull: false,
    defaultValue: 'pending',
    validate: { isIn: [[...INTEREST_STATUSES]] },
  })
  status!: CreationOptional<InterestStatus>;

  @Column({ type: DataType.DATE, allowNull: false })
  expiresAt!: Date;

  @Column({ type: DataType.DATE, allowNull: true })
  respondedAt!: CreationOptional<Date | null>;

  @CreatedAt
  override createdAt!: CreationOptional<Date>;

  @UpdatedAt
  override updatedAt!: CreationOptional<Date>;

  @BelongsTo(() => Event, { foreignKey: 'eventId' })
  event?: NonAttribute<Event | null>;
}
