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
import { MATCH_STATUSES, type MatchStatus } from '@garba-partner/shared';
import { AdminUser } from './admin-user.model.js';
import { Event } from './event.model.js';
import { PartnerInterest } from './partner-interest.model.js';
import { User } from './user.model.js';

/**
 * A mutual match (docs/matching/matches.md). Members are stored in canonical order
 * (`userAId < userBId`); use `canonicalPair()` when creating or looking one up.
 */
@Table({ tableName: 'matches' })
export class Match extends Model<InferAttributes<Match>, InferCreationAttributes<Match>> {
  @Column({ type: DataType.UUID, primaryKey: true, defaultValue: DataType.UUIDV4 })
  override id!: CreationOptional<string>;

  @ForeignKey(() => User)
  @Column({ type: DataType.UUID, allowNull: false })
  userAId!: string;

  @ForeignKey(() => User)
  @Column({ type: DataType.UUID, allowNull: false })
  userBId!: string;

  @ForeignKey(() => PartnerInterest)
  @Column({ type: DataType.UUID, allowNull: true })
  interestId!: CreationOptional<string | null>;

  @ForeignKey(() => Event)
  @Column({ type: DataType.UUID, allowNull: true })
  eventId!: CreationOptional<string | null>;

  @Column({
    type: DataType.STRING(20),
    allowNull: false,
    defaultValue: 'active',
    validate: { isIn: [[...MATCH_STATUSES]] },
  })
  status!: CreationOptional<MatchStatus>;

  @Column({ type: DataType.DATE, allowNull: true })
  endedAt!: CreationOptional<Date | null>;

  /** Internal only: never exposed to the other member. */
  @ForeignKey(() => User)
  @Column({ type: DataType.UUID, allowNull: true })
  endedByUserId!: CreationOptional<string | null>;

  @ForeignKey(() => AdminUser)
  @Column({ type: DataType.UUID, allowNull: true })
  endedByAdminId!: CreationOptional<string | null>;

  @CreatedAt
  override createdAt!: CreationOptional<Date>;

  @UpdatedAt
  override updatedAt!: CreationOptional<Date>;

  @BelongsTo(() => Event, { foreignKey: 'eventId' })
  event?: NonAttribute<Event | null>;
}

/**
 * Canonical (smaller ID first) ordering used by `matches`. For lowercase UUID text, string order
 * equals PostgreSQL's byte-wise uuid order, which the `user_a_id < user_b_id` CHECK uses.
 */
export function canonicalPair(a: string, b: string): { userAId: string; userBId: string } {
  const [x, y] = [a.toLowerCase(), b.toLowerCase()];
  return x < y ? { userAId: x, userBId: y } : { userAId: y, userBId: x };
}
