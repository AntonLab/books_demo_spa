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
import type { Series } from './Series.ts';
import type { User } from './User.ts';

// One row per Co-author credit on a series — the series' counterpart of
// BookAuthor, kept as its own table so each credit keeps a real foreign key
// to the work it names (ADR-0005).
export class SeriesAuthor extends Model<
  InferAttributes<SeriesAuthor>,
  InferCreationAttributes<SeriesAuthor>
> {
  // The surrogate id orders the byline, for the reason given in BookAuthor.ts:
  // DATETIME stores whole seconds, so createdAt would tie.
  declare id: CreationOptional<number>;
  declare seriesId: ForeignKey<Series['id']>;
  declare userId: ForeignKey<User['id']>;
  declare createdAt: CreationOptional<Date>;

  declare user?: NonAttribute<User>;
}

export function initSeriesAuthorModel(
  sequelize: Sequelize
): typeof SeriesAuthor {
  SeriesAuthor.init(
    {
      id: {
        type: DataTypes.INTEGER.UNSIGNED,
        autoIncrement: true,
        primaryKey: true,
      },
      // Both must match their targets' INTEGER UNSIGNED exactly, or MySQL
      // rejects the foreign keys with errno 3780.
      seriesId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
      userId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
      createdAt: { type: DataTypes.DATE, allowNull: false },
    },
    {
      sequelize,
      tableName: 'series_authors',
      // A credit is added or removed, never edited, so there is no updatedAt.
      timestamps: true,
      updatedAt: false,
      charset: 'utf8mb4',
      collate: 'utf8mb4_0900_ai_ci',
      indexes: [
        // Uniqueness in the schema, not a findOne first. Its leftmost column
        // also serves the seriesId foreign key.
        {
          name: 'series_authors_series_id_user_id',
          unique: true,
          fields: ['seriesId', 'userId'],
        },
        // Serves the userId foreign key and the `?userId=` lookup.
        { name: 'series_authors_user_id', fields: ['userId'] },
      ],
    }
  );

  return SeriesAuthor;
}
