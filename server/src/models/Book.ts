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
import { toTagArray } from './tagArray.ts';
import type { PublicBook } from '../types/book.ts';
import type { AuthorSummary } from '../types/user.ts';

export class Book extends Model<
  InferAttributes<Book>,
  InferCreationAttributes<Book>
> {
  declare id: CreationOptional<number>;
  // No userId: a book has no single owner. Its Co-authors live in
  // book_authors (models/BookAuthor.ts, ADR-0005).
  //
  // Nullable and creation-optional: a book can stand alone, outside any series.
  declare seriesId: CreationOptional<ForeignKey<Series['id']> | null>;
  declare title: string;
  declare description: string;
  declare tags: string[];
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  // Populated only by an eager `include`; NonAttribute keeps it out of the
  // inferred attribute set so it is never mistaken for a column.
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
      // Must match series.id exactly (INTEGER UNSIGNED) or MySQL rejects the
      // foreign key with errno 3780 on incompatible column types. allowNull is
      // what makes the association's ON DELETE SET NULL legal: MySQL rejects
      // SET NULL on a NOT NULL column.
      seriesId: {
        type: DataTypes.INTEGER.UNSIGNED,
        allowNull: true,
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
        // Serves the `?seriesId=` filter together with the list endpoint's
        // `ORDER BY id`, so it needs no filesort. It is also a leftmost prefix
        // of the foreign key's column, so InnoDB reuses it instead of creating
        // a second index for the constraint. `?userId=` goes through
        // book_authors_user_id instead.
        { name: 'books_series_id_id', fields: ['seriesId', 'id'] },
      ],
    }
  );

  return Book;
}

// The authors are passed in rather than read off an eager load: a page of books
// loads its credits in one query of its own (bookRepository.loadAuthors), and
// an include with a LIMIT would page over credit rows instead of books.
export function toPublicBook(book: Book, authors: AuthorSummary[]): PublicBook {
  return {
    id: book.id,
    authors,
    seriesId: book.seriesId ?? null,
    title: book.title,
    description: book.description,
    tags: toTagArray(book.tags),
    createdAt: book.createdAt,
    updatedAt: book.updatedAt,
  };
}
