import {
  DataTypes,
  Model,
  type CreationOptional,
  type ForeignKey,
  type InferAttributes,
  type InferCreationAttributes,
  type Sequelize,
} from 'sequelize';
import type { Series } from './Series.ts';

// A Series' Cover (CONTEXT.md, ADR-0007): one optional picture per Series,
// kept out of the series table so no list or detail query drags the bytes
// along. Same shape and same last-write-wins answer as BookCover.
export class SeriesCover extends Model<
  InferAttributes<SeriesCover>,
  InferCreationAttributes<SeriesCover>
> {
  declare seriesId: ForeignKey<Series['id']>;
  declare data: Buffer;
  declare updatedAt: CreationOptional<Date>;
}

export function initSeriesCoverModel(sequelize: Sequelize): typeof SeriesCover {
  SeriesCover.init(
    {
      // Must match series.id exactly (INTEGER UNSIGNED) or MySQL rejects the
      // foreign key with errno 3780.
      seriesId: {
        type: DataTypes.INTEGER.UNSIGNED,
        primaryKey: true,
      },
      // Always re-encoded WebP (src/images.ts), so no content-type column.
      data: {
        type: DataTypes.BLOB('medium'),
        allowNull: false,
      },
      // Millisecond precision: the cache-busting coverUrl depends on this
      // value changing between two replaces within one second.
      updatedAt: { type: DataTypes.DATE(3), allowNull: false },
    },
    {
      sequelize,
      tableName: 'series_covers',
      timestamps: true,
      createdAt: false,
      charset: 'utf8mb4',
      collate: 'utf8mb4_0900_ai_ci',
    }
  );

  return SeriesCover;
}
