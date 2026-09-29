import type { CreationOptional, InferAttributes, InferCreationAttributes } from 'sequelize';
import { Column, CreatedAt, DataType, ForeignKey, Model, Table } from 'sequelize-typescript';
import { Match } from './match.model.js';
import { User } from './user.model.js';

/**
 * A chat message (docs/chat/architecture.md). Immutable: the database rejects UPDATE.
 * `containsContactInfo` / `containsMoneyRequest` are moderation context only and never returned
 * to members.
 */
@Table({ tableName: 'messages', updatedAt: false })
export class Message extends Model<InferAttributes<Message>, InferCreationAttributes<Message>> {
  @Column({ type: DataType.UUID, primaryKey: true, defaultValue: DataType.UUIDV4 })
  override id!: CreationOptional<string>;

  @ForeignKey(() => Match)
  @Column({ type: DataType.UUID, allowNull: false })
  matchId!: string;

  @ForeignKey(() => User)
  @Column({ type: DataType.UUID, allowNull: false })
  senderId!: string;

  @Column({ type: DataType.UUID, allowNull: false })
  clientMessageId!: string;

  @Column({ type: DataType.STRING(1000), allowNull: false })
  body!: string;

  @Column({ type: DataType.BOOLEAN, allowNull: false, defaultValue: false })
  containsContactInfo!: CreationOptional<boolean>;

  /** Looks like a request for money or payment details. Moderation context only. */
  @Column({ type: DataType.BOOLEAN, allowNull: false, defaultValue: false })
  containsMoneyRequest!: CreationOptional<boolean>;

  @CreatedAt
  override createdAt!: CreationOptional<Date>;
}
