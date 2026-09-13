import {
  col,
  fn,
  ForeignKeyConstraintError,
  Op,
  UniqueConstraintError,
  where as sequelizeWhere,
} from 'sequelize';
import type { Sequelize, Transaction, WhereOptions } from 'sequelize';
import { Book, toPublicBook } from '../models/Book.ts';
import { BookAuthor } from '../models/BookAuthor.ts';
import { findSeriesCoAuthorIds } from './seriesRepository.ts';
import { readableBookWhere, type Viewer } from './visibility.ts';
import { Like } from '../models/Like.ts';
import { Series } from '../models/Series.ts';
import { User, toAuthorSummary } from '../models/User.ts';
import {
  BadRequestError,
  NotFoundError,
  StateConflictError,
} from '../types/errors.ts';
import type {
  BookDetail,
  CreateBookInput,
  ListBooksQuery,
  PublicBook,
  UpdateBookInput,
} from '../types/book.ts';
import type { AuthorSummary } from '../types/user.ts';
import { containsPattern } from './likePattern.ts';

function sequelizeOf(): Sequelize {
  const sequelize = Book.sequelize;
  if (!sequelize) throw new Error('Book model is not initialised');
  return sequelize;
}

export interface BookListResult {
  items: PublicBook[];
  total: number;
}

export interface BookRepository {
  // userId is the book's first Co-author. It is not part of CreateBookInput:
  // it comes from the session, never the request body, so it is supplied as a
  // separate argument rather than a schema field a caller could set.
  create(input: CreateBookInput & { userId: number }): Promise<PublicBook>;
  list(query: ListBooksQuery, viewer: Viewer): Promise<BookListResult>;
  findById(id: number): Promise<PublicBook | null>;
  // Separate from findById rather than replacing it: the detail read costs a
  // series join and two like queries, and the write paths that only need to
  // know a row exists should not pay for them.
  //
  // null, too, for a Draft book the viewer may not read: the caller reports it
  // exactly as a missing book, so a refusal does not reveal the draft exists.
  findDetailById(id: number, viewer: Viewer): Promise<BookDetail | null>;
  update(id: number, input: UpdateBookInput): Promise<PublicBook | null>;
  remove(id: number): Promise<boolean>;
  // null when the book is not there, as update/remove report it.
  addCoAuthor(bookId: number, userId: number): Promise<PublicBook | null>;
  // Covers both removing someone else and leaving: the caller's identity is
  // the controller's business, the rules on the book's credits are this one's.
  removeCoAuthor(bookId: number, userId: number): Promise<PublicBook | null>;
  // The cheapest question the ownership check can ask: one indexed lookup, no
  // eager loads, no serialisation. null when the book is not there.
  findCoAuthorIds(id: number): Promise<number[] | null>;
  // The same question about the series a book is being filed under, asked
  // before the write — mirrors chapterRepository.findBookCoAuthorIds one level
  // up. null when the series is not there.
  findSeriesCoAuthorIds(seriesId: number): Promise<number[] | null>;
}

// A rejected FK while creating a book means a referenced row does not exist.
// Reporting that as a 404 is more useful than the generic 500 an unmapped
// SequelizeForeignKeyConstraintError would produce.
//
// Two foreign keys can fail — books.seriesId, and book_authors.userId for the
// first credit — so the error has to say which: a "User not found" for a bad
// seriesId would send the caller hunting for a user that is sitting right
// there. MySQL names the offending column in the constraint text, which is the
// only place the two are distinguishable; seriesId can only be at fault when
// one was supplied, so userId is the safe fallback.
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

// Every Co-author of every book named, in credit order, in one query. Books
// with no credits come back with an empty list rather than missing, so a
// caller can index the map without a fallback.
async function loadAuthors(
  bookIds: number[],
  transaction?: Transaction
): Promise<Map<number, AuthorSummary[]>> {
  const authors = new Map<number, AuthorSummary[]>(
    bookIds.map((id) => [id, []])
  );
  if (bookIds.length === 0) return authors;

  const credits = await BookAuthor.findAll({
    where: { bookId: bookIds },
    include: [{ model: User, as: 'user' }],
    order: [['id', 'ASC']],
    transaction,
  });
  for (const credit of credits) {
    if (credit.user) {
      authors.get(credit.bookId)?.push(toAuthorSummary(credit.user));
    }
  }
  return authors;
}

async function withAuthors(
  book: Book,
  transaction?: Transaction
): Promise<PublicBook> {
  const authors = await loadAuthors([book.id], transaction);
  return toPublicBook(book, authors.get(book.id) ?? []);
}

// creditedBookIds is the books `?userId=` names, looked up beforehand: a book
// matches through any of its Co-authors, and a plain id list keeps the LIMIT
// paging over books, which an include on the credits would not.
function buildWhere(
  query: ListBooksQuery,
  creditedBookIds: number[] | undefined,
  viewer: Viewer
): WhereOptions {
  const clauses: WhereOptions[] = [];

  if (creditedBookIds !== undefined) {
    // An empty list becomes `IN (NULL)`, which matches nothing, as it should.
    clauses.push({ id: creditedBookIds });
  }

  // A Draft book shows in exactly one list: its own Co-author's `?userId=`,
  // which is where "My books" finds it. Every other list — a Moderator's
  // included — leaves it out; a Moderator reaches a draft by direct link only.
  const listingOwnBooks =
    viewer !== null && query.userId !== undefined && query.userId === viewer.id;
  if (!listingOwnBooks) {
    clauses.push({ status: { [Op.ne]: 'draft' } });
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
        // One transaction, so a book never exists without its first credit.
        return await sequelizeOf().transaction(async (transaction) => {
          const { userId, ...attributes } = input;
          const book = await Book.create(attributes, { transaction });
          await BookAuthor.create({ bookId: book.id, userId }, { transaction });
          return withAuthors(book, transaction);
        });
      } catch (error) {
        asMissingReference(error, input.userId, input.seriesId);
      }
    },

    async list(query, viewer) {
      const creditedBookIds =
        query.userId === undefined
          ? undefined
          : (
              await BookAuthor.findAll({
                where: { userId: query.userId },
                attributes: ['bookId'],
              })
            ).map((credit) => credit.bookId);

      const { rows, count } = await Book.findAndCountAll({
        where: buildWhere(query, creditedBookIds, viewer),
        limit: query.limit,
        offset: query.offset,
        order: [['id', 'ASC']],
      });

      const authors = await loadAuthors(rows.map((row) => row.id));
      return {
        items: rows.map((row) => toPublicBook(row, authors.get(row.id) ?? [])),
        total: count,
      };
    },

    async findById(id) {
      const book = await Book.findByPk(id);
      return book ? withAuthors(book) : null;
    },

    async findDetailById(id, viewer) {
      const viewerId = viewer?.id ?? null;
      const book = await Book.findOne({
        where: { [Op.and]: [{ id }, await readableBookWhere(viewer)] },
        include: [{ model: Series, as: 'series' }],
      });
      if (!book) return null;

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
        ...(await withAuthors(book)),
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
      return withAuthors(book);
    },

    async remove(id) {
      const deleted = await Book.destroy({ where: { id } });
      return deleted > 0;
    },

    async addCoAuthor(bookId, userId) {
      const book = await Book.findByPk(bookId);
      if (!book) return null;

      const user = await User.findByPk(userId, { attributes: ['role'] });
      if (!user) throw new NotFoundError('User', userId);
      if (user.role !== 'author') {
        throw new BadRequestError(
          'Only an account holding the author role can be a co-author'
        );
      }

      try {
        await BookAuthor.create({ bookId, userId });
      } catch (error) {
        if (error instanceof UniqueConstraintError) {
          throw new StateConflictError(
            'That account is already a co-author of this book'
          );
        }
        throw error;
      }
      return withAuthors(book);
    },

    // The count and the delete share a transaction under a lock on the book
    // row: without it, two co-authors of a two-author book leaving at once
    // would each count two, each delete, and leave the book credited to
    // nobody. userRepository.remove takes the same lock for the same reason.
    async removeCoAuthor(bookId, userId) {
      return sequelizeOf().transaction(async (transaction) => {
        const book = await Book.findByPk(bookId, {
          transaction,
          lock: transaction.LOCK.UPDATE,
        });
        if (!book) return null;

        const credits = await BookAuthor.findAll({
          where: { bookId },
          attributes: ['userId'],
          transaction,
        });
        // Not credited comes first: on a solo book a stranger would otherwise
        // be told the book's real co-author cannot leave.
        if (!credits.some((credit) => credit.userId === userId)) {
          throw new NotFoundError('Co-author', userId);
        }
        if (credits.length <= 1) {
          throw new StateConflictError(
            'The last co-author cannot leave; delete the book instead'
          );
        }

        await BookAuthor.destroy({ where: { bookId, userId }, transaction });
        return withAuthors(book, transaction);
      });
    },

    async findCoAuthorIds(id) {
      const book = await Book.findByPk(id, { attributes: ['id'] });
      if (!book) return null;

      const credits = await BookAuthor.findAll({
        where: { bookId: id },
        attributes: ['userId'],
        order: [['id', 'ASC']],
      });
      return credits.map((credit) => credit.userId);
    },

    findSeriesCoAuthorIds,
  };
}
