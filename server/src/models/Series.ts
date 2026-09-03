import {
  DataTypes,
  Model,
  type CreationOptional,
  type ForeignKey,
  type InferAttributes,
  type InferCreationAttributes,
  type NonAttribute,
  type Sequelize,
} from 'sequelize';
import type { Book } from './Book.ts';
import type { User } from './User.ts';
import { toTagArray } from './tagArray.ts';
import type { PublicSeries } from '../types/series.ts';

export class Series extends Model<
  InferAttributes<Series>,
  InferCreationAttributes<Series>
> {
  declare id: CreationOptional<number>;
  declare userId: ForeignKey<User['id']>;
  declare description: string;
  declare tags: string[];
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  // Populated only by an eager `include`; NonAttribute keeps them out of the
  // inferred attribute set so they are never mistaken for columns.
  declare user?: NonAttribute<User>;
  // Set by Series.hasMany(Book); the import is type-only, so the cycle with
  // Book.ts is erased at runtime.
  declare books?: NonAttribute<Book[]>;
}

export function initSeriesModel(sequelize: Sequelize): typeof Series {
  Series.init(
    {
      id: {
        type: DataTypes.INTEGER.UNSIGNED,
        autoIncrement: true,
        primaryKey: true,
      },
      // Must match users.id exactly (INTEGER UNSIGNED) or MySQL rejects the
      // foreign key with errno 3780 on incompatible column types.
      userId: {
        type: DataTypes.INTEGER.UNSIGNED,
        allowNull: false,
      },
      description: {
        type: DataTypes.TEXT,
        allowNull: false,
      },
      // MySQL has no array type, and DataTypes.ARRAY is Postgres-only. A JSON
      // column also cannot carry a literal DEFAULT, so the empty-array default
      // lives in createSeriesSchema rather than in the DDL.
      tags: {
        type: DataTypes.JSON,
        allowNull: false,
      },
      // See User.ts: declaring the timestamps ourselves opts out of Sequelize's
      // implicit NOT NULL, so it is restated here.
      createdAt: { type: DataTypes.DATE, allowNull: false },
      updatedAt: { type: DataTypes.DATE, allowNull: false },
    },
    {
      sequelize,
      tableName: 'series',
      timestamps: true,
      charset: 'utf8mb4',
      collate: 'utf8mb4_0900_ai_ci',
      indexes: [
        // Serves the `?userId=` filter together with the list endpoint's
        // `ORDER BY id`, so neither needs a filesort.
        { name: 'series_user_id_id', fields: ['userId', 'id'] },
      ],
    }
  );

  return Series;
}

export function toPublicSeries(series: Series): PublicSeries {
  return {
    id: series.id,
    userId: series.userId,
    description: series.description,
    tags: toTagArray(series.tags),
    createdAt: series.createdAt,
    updatedAt: series.updatedAt,
  };
}
