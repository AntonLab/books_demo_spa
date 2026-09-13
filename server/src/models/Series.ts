import {
  DataTypes,
  Model,
  type CreationOptional,
  type InferAttributes,
  type InferCreationAttributes,
  type NonAttribute,
  type Sequelize,
} from 'sequelize';
import type { Book } from './Book.ts';
import { toTagArray } from './tagArray.ts';
import type { PublicSeries } from '../types/series.ts';
import type { AuthorSummary } from '../types/user.ts';

export class Series extends Model<
  InferAttributes<Series>,
  InferCreationAttributes<Series>
> {
  declare id: CreationOptional<number>;
  // No userId: a series has no single owner. Its Co-authors live in
  // series_authors (models/SeriesAuthor.ts, ADR-0005).
  declare title: string;
  declare description: string;
  declare tags: string[];
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  // Set by Series.hasMany(Book) and populated only by an eager `include`;
  // NonAttribute keeps it out of the inferred attribute set, and the import is
  // type-only, so the cycle with Book.ts is erased at runtime.
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
      // VARCHAR rather than the TEXT below it: a title is short, and only a
      // bounded column can carry an index if one is ever wanted for it.
      title: {
        type: DataTypes.STRING(255),
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
      // No secondary index: `?userId=` goes through series_authors_user_id.
    }
  );

  return Series;
}

// The authors are passed in, as toPublicBook's are: a page of series loads its
// credits in one query of its own rather than through an include.
export function toPublicSeries(
  series: Series,
  authors: AuthorSummary[]
): PublicSeries {
  return {
    id: series.id,
    authors,
    title: series.title,
    description: series.description,
    tags: toTagArray(series.tags),
    createdAt: series.createdAt,
    updatedAt: series.updatedAt,
  };
}
