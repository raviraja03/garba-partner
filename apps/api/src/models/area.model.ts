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
import { City } from './city.model.js';

/** Neighbourhood-level areas of a city — never street level or exact locations. */
@Table({ tableName: 'areas' })
export class Area extends Model<InferAttributes<Area>, InferCreationAttributes<Area>> {
  @Column({ type: DataType.UUID, primaryKey: true, defaultValue: DataType.UUIDV4 })
  override id!: CreationOptional<string>;

  @ForeignKey(() => City)
  @Column({ type: DataType.UUID, allowNull: false })
  cityId!: string;

  @Column({ type: DataType.STRING(80), allowNull: false })
  name!: string;

  @Column({ type: DataType.STRING(100), allowNull: false })
  slug!: string;

  @Column({ type: DataType.BOOLEAN, allowNull: false, defaultValue: true })
  isActive!: CreationOptional<boolean>;

  @Column({ type: DataType.SMALLINT, allowNull: false, defaultValue: 0 })
  sortOrder!: CreationOptional<number>;

  @CreatedAt
  override createdAt!: CreationOptional<Date>;

  @UpdatedAt
  override updatedAt!: CreationOptional<Date>;

  @BelongsTo(() => City, { foreignKey: 'cityId' })
  city?: NonAttribute<City>;
}
