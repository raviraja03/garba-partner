import type {
  CreationOptional,
  InferAttributes,
  InferCreationAttributes,
  NonAttribute,
} from 'sequelize';
import {
  Column,
  CreatedAt,
  DataType,
  HasMany,
  Model,
  Table,
  UpdatedAt,
} from 'sequelize-typescript';
import { Area } from './area.model.js';

/** Launch cities (reference data, seeded by migration). Deactivated, never deleted. */
@Table({ tableName: 'cities' })
export class City extends Model<InferAttributes<City>, InferCreationAttributes<City>> {
  @Column({ type: DataType.UUID, primaryKey: true, defaultValue: DataType.UUIDV4 })
  override id!: CreationOptional<string>;

  @Column({ type: DataType.STRING(80), allowNull: false })
  name!: string;

  @Column({ type: DataType.STRING(80), allowNull: false })
  state!: string;

  @Column({ type: DataType.STRING(100), allowNull: false, unique: 'cities_slug_unique' })
  slug!: string;

  @Column({ type: DataType.BOOLEAN, allowNull: false, defaultValue: true })
  isActive!: CreationOptional<boolean>;

  @Column({ type: DataType.SMALLINT, allowNull: false, defaultValue: 0 })
  sortOrder!: CreationOptional<number>;

  @CreatedAt
  override createdAt!: CreationOptional<Date>;

  @UpdatedAt
  override updatedAt!: CreationOptional<Date>;

  @HasMany(() => Area, { foreignKey: 'cityId' })
  areas?: NonAttribute<Area[]>;
}
