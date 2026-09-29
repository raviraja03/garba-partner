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

/** `blocker` blocked `blocked`. Effects are symmetric (docs/safety/blocking.md). */
@Table({ tableName: 'blocks', updatedAt: false })
export class Block extends Model<InferAttributes<Block>, InferCreationAttributes<Block>> {
  @Column({ type: DataType.UUID, primaryKey: true, defaultValue: DataType.UUIDV4 })
  override id!: CreationOptional<string>;

  @ForeignKey(() => User)
  @Column({ type: DataType.UUID, allowNull: false })
  blockerId!: string;

  @ForeignKey(() => User)
  @Column({ type: DataType.UUID, allowNull: false })
  blockedId!: string;

  @CreatedAt
  override createdAt!: CreationOptional<Date>;

  @BelongsTo(() => User, { foreignKey: 'blockedId', as: 'blocked' })
  blocked?: NonAttribute<User>;
}
