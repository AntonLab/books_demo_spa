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
import type { Genre } from './Genre.ts';
import type { Series } from './Series.ts';
import { toTagArray } from './tagArray.ts';
import type {
  BookStatus,
  PublicBook,
  PublicGenre,
  AuthorSummary,
} from 'shared';
import { BOOK_STATUSES } from 'shared';

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
  // The Book's Genre (CONTEXT.md, ADR-0008): one or none, set independently of
  // its Series'. Nullable, which is what makes the association's
  // ON DELETE SET NULL legal — MySQL refuses SET NULL on a NOT NULL column.
  declare genreId: CreationOptional<ForeignKey<Genre['id']> | null>;
  // The book's place in its series' Series order (CONTEXT.md): 1-based,
  // gapped after a book leaves, and null outside a series. It orders a
  // series' book lists and is never sent to a client.
  declare seriesPosition: CreationOptional<number | null>;
  declare title: string;
  declare description: string;
  declare tags: string[];
  // Creation-optional: the column defaults to `draft`, which is where every
  // book starts.
  declare status: CreationOptional<BookStatus>;
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
      // Set by bookRepository whenever a book is filed into a series, which
      // appends it; cleared when it leaves.
      seriesPosition: {
        type: DataTypes.INTEGER.UNSIGNED,
        allowNull: true,
      },
      // Must match genres.id exactly (INTEGER UNSIGNED), as seriesId matches
      // series.id, or MySQL rejects the foreign key with errno 3780 on
      // incompatible column types.
      genreId: {
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
      // The Book status (CONTEXT.md). A DDL default, unlike tags, because an
      // ENUM column can carry one — so a row written straight through the
      // model is a draft too, not only one created through the API.
      status: {
        type: DataTypes.ENUM(...BOOK_STATUSES),
        allowNull: false,
        defaultValue: 'draft',
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
        // Serves the `?seriesId=` filter together with its
        // `ORDER BY seriesPosition, id` — InnoDB appends the primary key to
        // every secondary index — so it needs no filesort. It is also a
        // leftmost prefix of the foreign key's column, so InnoDB reuses it
        // instead of creating a second index for the constraint. Not unique,
        // for the reason chapters_book_id_position gives. `?userId=` goes
        // through book_authors_user_id instead.
        {
          name: 'books_series_id_series_position',
          fields: ['seriesId', 'seriesPosition'],
        },
        // Serves the `?genreId=` filter, and is the leftmost prefix of the
        // foreign key's column, so InnoDB reuses it instead of creating a
        // second index for the constraint. Not unique: any number of books
        // share a Genre.
        {
          name: 'books_genre_id',
          fields: ['genreId'],
        },
      ],
    }
  );

  return Book;
}

// The authors are passed in rather than read off an eager load: a page of books
// loads its credits in one query of its own (bookRepository.loadAuthors), and
// an include with a LIMIT would page over credit rows instead of books.
export function toPublicBook(
  book: Book,
  authors: AuthorSummary[],
  coverUrl: string | null,
  genre: PublicGenre | null
): PublicBook {
  return {
    id: book.id,
    authors,
    seriesId: book.seriesId ?? null,
    title: book.title,
    description: book.description,
    tags: toTagArray(book.tags),
    status: book.status,
    genre,
    coverUrl,
    createdAt: book.createdAt,
    updatedAt: book.updatedAt,
  };
}
