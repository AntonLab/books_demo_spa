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
  BookSeriesRef,
  BookStatus,
  PublicBook,
  PublicGenre,
  AuthorSummary,
} from 'shared';
import { BOOK_STATUSES, WORK_TITLE_MAX_LENGTH } from 'shared';

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
  // When the announcement pass told the Book's Series Favorite holders it is
  // out (ADR-0013), set once its Release time has passed while it is
  // Published; null until then and never cleared. Never sent to a client.
  declare announcedAt: CreationOptional<Date | null>;
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
      // INTEGER UNSIGNED to match series.id (errno 3780 otherwise). allowNull
      // is what makes the association's ON DELETE SET NULL legal.
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
      // INTEGER UNSIGNED to match genres.id (errno 3780 otherwise).
      genreId: {
        type: DataTypes.INTEGER.UNSIGNED,
        allowNull: true,
      },
      // VARCHAR rather than the TEXT below it: a title is short, and only a
      // bounded column can carry an index if one is ever wanted for it.
      title: {
        type: DataTypes.STRING(WORK_TITLE_MAX_LENGTH),
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
      announcedAt: { type: DataTypes.DATE(3), allowNull: true },
      // allowNull: false restated (see User.ts).
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
        // Serves `?seriesId=` with `ORDER BY seriesPosition, id` (InnoDB
        // appends the primary key to every secondary index, so no filesort)
        // and doubles as the FK index. Not unique, for the reason
        // chapters_book_id_position gives. `?userId=` goes through
        // book_authors_user_id instead.
        {
          name: 'books_series_id_series_position',
          fields: ['seriesId', 'seriesPosition'],
        },
        // Serves `?genreId=` and doubles as the FK index. Not unique: any
        // number of books share a Genre.
        {
          name: 'books_genre_id',
          fields: ['genreId'],
        },
        // Serves the announcement pass's `announcedAt IS NULL AND status !=
        // 'draft'` scan (announcementRepository.ts releaseBooks); without it
        // every pass's FOR UPDATE takes a full-table next-key lock, mirroring
        // chapters_announced_at_published_at (a19824e).
        {
          name: 'books_announced_at_status',
          fields: ['announcedAt', 'status'],
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
  genre: PublicGenre | null,
  series: BookSeriesRef | null
): PublicBook {
  return {
    id: book.id,
    authors,
    seriesId: book.seriesId ?? null,
    series,
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
