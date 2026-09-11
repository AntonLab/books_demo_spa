import {
  col,
  fn,
  ForeignKeyConstraintError,
  Op,
  where as sequelizeWhere,
} from 'sequelize';
import type { WhereOptions } from 'sequelize';
import { Book, toPublicBook } from '../models/Book.ts';
import { Like } from '../models/Like.ts';
import { Series } from '../models/Series.ts';
import { User, toAuthorSummary } from '../models/User.ts';
import { NotFoundError } from '../types/errors.ts';
import type {
  BookDetail,
  CreateBookInput,
  ListBooksQuery,
  PublicBook,
  UpdateBookInput,
} from '../types/book.ts';
import { containsPattern } from './likePattern.ts';

export interface BookListResult {
  items: PublicBook[];
  total: number;
}

export interface BookRepository {
  // userId is not part of CreateBookInput: it comes from the session, never
  // the request body, so it is supplied as a separate argument rather than a
  // schema field a caller could set.
  create(input: CreateBookInput & { userId: number }): Promise<PublicBook>;
  list(query: ListBooksQuery): Promise<BookListResult>;
  findById(id: number): Promise<PublicBook | null>;
  // Separate from findById rather than replacing it: the detail read costs an
  // author join, a series join and two like queries, and the write paths that
  // only need to know a row exists should not pay for them.
  findDetailById(
    id: number,
    viewerId: number | null
  ): Promise<BookDetail | null>;
  update(id: number, input: UpdateBookInput): Promise<PublicBook | null>;
  remove(id: number): Promise<boolean>;
  // The cheapest question the ownership check can ask: one indexed column, no
  // eager loads, no serialisation.
  findOwnerId(id: number): Promise<number | null>;
  // The same question about the series a book is being filed under, asked
  // before the write — mirrors chapterRepository.findBookOwnerId one level up.
  findSeriesOwnerId(seriesId: number): Promise<number | null>;
}

// A rejected FK on `books` means the referenced row does not exist. Reporting
// that as a 404 is more useful than the generic 500 an unmapped
// SequelizeForeignKeyConstraintError would produce.
//
// Unlike series, books carry two foreign keys, so the error has to say which
// one failed — a "User not found" for a bad seriesId would send the caller
// hunting for a user that is sitting right there. MySQL names the offending
// column in the constraint text, which is the only place the two are
// distinguishable; seriesId can only be at fault when one was supplied, so
// userId is the safe fallback.
function asMissingReference(
  error: unknown,
  userId: number | undefined,
  seriesId: number | null | undefined
): never {
  if (error instanceof ForeignKeyConstraintError) {
    const detail = `${error.index ?? ''} ${error.parent?.message ?? error.message}`;

    if (
      seriesId !== null &&
      seriesId !== undefined &&
      detail.includes('seriesId')
    ) {
      throw new NotFoundError('Series', seriesId);
    }
    if (userId !== undefined) {
      throw new NotFoundError('User', userId);
    }
  }
  throw error;
}

function buildWhere(query: ListBooksQuery): WhereOptions {
  const clauses: WhereOptions[] = [];

  if (query.userId !== undefined) {
    clauses.push({ userId: query.userId });
  }

  if (query.seriesId !== undefined) {
    clauses.push({ seriesId: query.seriesId });
  }

  if (query.tag) {
    // MySQL cannot index into a plain JSON array with `=`, so membership goes
    // through JSON_CONTAINS. The tag is passed as an argument to fn(), which
    // Sequelize escapes as a literal — it is never concatenated into the SQL.
    clauses.push(
      sequelizeWhere(
        fn('JSON_CONTAINS', col('tags'), JSON.stringify(query.tag)),
        Op.eq,
        1
      )
    );
  }

  if (query.q) {
    // Searches the title as well as the description, so `?q=` finds a book by
    // its name. Both sides are a leading-wildcard LIKE and therefore a full
    // scan — unavoidable for substring search, and the cost the description
    // side already paid.
    const pattern = containsPattern(query.q);
    clauses.push({
      [Op.or]: [
        { title: { [Op.like]: pattern } },
        { description: { [Op.like]: pattern } },
      ],
    });
  }

  return clauses.length > 0 ? { [Op.and]: clauses } : {};
}

export function createSequelizeBookRepository(): BookRepository {
  return {
    async create(input) {
      try {
        const book = await Book.create(input);
        return toPublicBook(book);
      } catch (error) {
        asMissingReference(error, input.userId, input.seriesId);
      }
    },

    async list(query) {
      const { rows, count } = await Book.findAndCountAll({
        where: buildWhere(query),
        limit: query.limit,
        offset: query.offset,
        order: [['id', 'ASC']],
      });

      return { items: rows.map(toPublicBook), total: count };
    },

    async findById(id) {
      const book = await Book.findByPk(id);
      return book ? toPublicBook(book) : null;
    },

    async findDetailById(id, viewerId) {
      const book = await Book.findByPk(id, {
        include: [
          { model: User, as: 'user' },
          { model: Series, as: 'series' },
        ],
      });
      // `user` is guaranteed by the NOT NULL foreign key, so a book without one
      // means the row itself is missing rather than the author.
      if (!book?.user) return null;

      // Two follow-up queries rather than a correlated subquery in the SELECT
      // above: each is a single indexed lookup on likes, and keeping them apart
      // leaves the include readable.
      const likeCount = await Like.count({
        where: { bookId: id, isLike: true },
      });
      const viewerLike =
        viewerId === null
          ? null
          : await Like.findOne({
              where: { bookId: id, userId: viewerId },
              attributes: ['id'],
            });

      return {
        ...toPublicBook(book),
        author: toAuthorSummary(book.user),
        series: book.series
          ? { id: book.series.id, title: book.series.title }
          : null,
        likeCount,
        viewerLikeId: viewerLike?.id ?? null,
      };
    },

    async update(id, input) {
      const book = await Book.findByPk(id);
      if (!book) return null;

      try {
        // `update` writes only the keys present, so an omitted seriesId leaves
        // the link alone while an explicit null clears it.
        await book.update(input);
      } catch (error) {
        asMissingReference(error, undefined, input.seriesId);
      }
      return toPublicBook(book);
    },

    async remove(id) {
      const deleted = await Book.destroy({ where: { id } });
      return deleted > 0;
    },

    async findOwnerId(id) {
      const book = await Book.findByPk(id, { attributes: ['userId'] });
      return book?.userId ?? null;
    },

    async findSeriesOwnerId(seriesId) {
      const series = await Series.findByPk(seriesId, {
        attributes: ['userId'],
      });
      return series?.userId ?? null;
    },
  };
}
