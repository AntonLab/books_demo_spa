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
import { toTagArray } from './tagArray.ts';
import type { PublicBook } from '../types/book.ts';

export class Book extends Model<
  InferAttributes<Book>,
  InferCreationAttributes<Book>
> {
  declare id: CreationOptional<number>;
  declare userId: ForeignKey<User['id']>;
  // Nullable and creation-optional: a book can stand alone, outside any series.
  declare seriesId: CreationOptional<ForeignKey<Series['id']> | null>;
  declare description: string;
  declare tags: string[];
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  // Populated only by an eager `include`; NonAttribute keeps them out of the
  // inferred attribute set so they are never mistaken for columns.
  declare user?: NonAttribute<User>;
  declare series?: NonAttribute<Series>;
}

export function initBookModel(sequelize: Sequelize): typeof Book {
  Book.init(
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
      // Same rule against series.id. allowNull is what makes the association's
      // ON DELETE SET NULL legal: MySQL rejects SET NULL on a NOT NULL column.
      seriesId: {
        type: DataTypes.INTEGER.UNSIGNED,
        allowNull: true,
      },
      description: {
        type: DataTypes.TEXT,
        allowNull: false,
      },
      // MySQL has no array type, and DataTypes.ARRAY is Postgres-only. A JSON
      // column also cannot carry a literal DEFAULT, so the empty-array default
      // lives in createBookSchema rather than in the DDL.
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
      tableName: 'books',
      timestamps: true,
      charset: 'utf8mb4',
      collate: 'utf8mb4_0900_ai_ci',
      indexes: [
        // Each serves its `?userId=` / `?seriesId=` filter together with the
        // list endpoint's `ORDER BY id`, so neither needs a filesort. Both are
        // also a leftmost prefix of their foreign key's column, so InnoDB
        // reuses them instead of creating a second index per constraint.
        { name: 'books_user_id_id', fields: ['userId', 'id'] },
        { name: 'books_series_id_id', fields: ['seriesId', 'id'] },
      ],
    }
  );

  return Book;
}

export function toPublicBook(book: Book): PublicBook {
  return {
    id: book.id,
    userId: book.userId,
    seriesId: book.seriesId ?? null,
    description: book.description,
    tags: toTagArray(book.tags),
    createdAt: book.createdAt,
    updatedAt: book.updatedAt,
  };
}
