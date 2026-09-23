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
import { BookCover } from '../models/BookCover.ts';
import { assertGenreExists, genreOf, loadGenres } from './genreRepository.ts';
import { findSeriesCoAuthorIds } from './seriesRepository.ts';
import { readableBookWhere, type Viewer } from './visibility.ts';
import { Like } from '../models/Like.ts';
import { Series } from '../models/Series.ts';
import { User, toAuthorSummary } from '../models/User.ts';
import { loadAvatarUrls } from './userRepository.ts';
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
  SeriesBookSummary,
  UpdateBookInput,
} from '../types/book.ts';
import type { AuthorSummary } from '../types/user.ts';
import { containsPattern } from './likePattern.ts';
import {
  deleterOf,
  displayNameOf,
  notify,
  type Actor,
} from './notificationRepository.ts';

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
  // The three writes that change who is credited on a book, or end it, take
  // the actor: each tells the other Co-authors in the same transaction
  // (repositories/notificationRepository.ts). Who may act is the controller's
  // business.
  remove(id: number, actor: Actor): Promise<boolean>;
  // null when the book is not there, as update/remove report it.
  addCoAuthor(
    bookId: number,
    userId: number,
    actor: Actor
  ): Promise<PublicBook | null>;
  // Covers both removing someone else and leaving — the actor naming the
  // account removed is what makes it a leave.
  removeCoAuthor(
    bookId: number,
    userId: number,
    actor: Actor
  ): Promise<PublicBook | null>;
  // The cheapest question the ownership check can ask: one indexed lookup, no
  // eager loads, no serialisation. null when the book is not there.
  findCoAuthorIds(id: number): Promise<number[] | null>;
  // The same question about the series a book is being filed under, asked
  // before the write — mirrors chapterRepository.findBookCoAuthorIds one level
  // up. null when the series is not there.
  findSeriesCoAuthorIds(seriesId: number): Promise<number[] | null>;
  // The series editor's list: every book filed in the series, drafts included,
  // in Series order. Kept here rather than in seriesRepository because it reads
  // and writes books, as chapterRepository owns a book's chapter order. null
  // when the series is not there.
  listInSeries(seriesId: number): Promise<SeriesBookSummary[] | null>;
  // Rewrites the Series order to `bookIds`, which must name every book in the
  // series exactly once; anything else is a StateConflictError that changes
  // nothing. False when the series is not there.
  reorderInSeries(seriesId: number, bookIds: number[]): Promise<boolean>;
  // The Cover's bytes never ride along with any other read (S2) — these
  // three are the only place book_covers is touched. false/null mean "no
  // such Book", exactly as the other single-row methods report it —
  // removeCover included, so a caller can tell "no such Book" from "no Cover
  // to remove", which are both otherwise silent no-ops.
  setCover(bookId: number, data: Buffer): Promise<boolean>;
  removeCover(bookId: number): Promise<boolean>;
  getCoverData(
    bookId: number,
    viewer: Viewer
  ): Promise<{ data: Buffer; updatedAt: Date } | null>;
}

// A rejected FK while creating a book means its first credit names an account
// that is gone. Reporting that as a 404 is more useful than the generic 500 an
// unmapped SequelizeForeignKeyConstraintError would produce.
//
// book_authors.userId is the only foreign key this maps. books.seriesId
// cannot fail here: every write that sets it to a new series goes through
// nextSeriesPosition first, which holds that series row under a lock for the
// rest of the transaction and answers a missing one with NotFoundError itself,
// and a write that keeps the series holds a lock on a book row already
// pointing at it, which deleting the series would have to change. Nor can
// books.genreId: assertGenreExists (genreRepository.ts) holds the Genre under
// a share lock for the rest of the transaction.
function asMissingUser(error: unknown, userId: number): never {
  if (error instanceof ForeignKeyConstraintError) {
    throw new NotFoundError('User', userId);
  }
  throw error;
}

// The place a book filed into `seriesId` takes: after the last one. Under a
// lock on the series row, which a reorder takes too, so two books filed at
// once cannot share a place and one filed mid-reorder cannot land inside it.
// The lock also settles whether the series exists.
async function nextSeriesPosition(
  seriesId: number,
  transaction: Transaction
): Promise<number> {
  const series = await Series.findByPk(seriesId, {
    attributes: ['id'],
    transaction,
    lock: transaction.LOCK.UPDATE,
  });
  if (!series) throw new NotFoundError('Series', seriesId);

  const last = await Book.max<number | null, Book>('seriesPosition', {
    where: { seriesId },
    transaction,
  });
  return (last ?? 0) + 1;
}

// Every Cover's URL for the books named, in one query — the same batching
// loadAuthors uses, and for the same reason: a page's LIMIT must stay over
// books, never over a joined table.
async function loadCoverUrls(
  bookIds: number[],
  transaction?: Transaction
): Promise<Map<number, string>> {
  if (bookIds.length === 0) return new Map();

  const covers = await BookCover.findAll({
    where: { bookId: bookIds },
    attributes: ['bookId', 'updatedAt'],
    transaction,
  });
  return new Map(
    covers.map((cover) => [
      cover.bookId,
      `/api/books/${cover.bookId}/cover?v=${cover.updatedAt.getTime()}`,
    ])
  );
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
  const avatarUrls = await loadAvatarUrls(
    credits.flatMap((credit) => (credit.user ? [credit.user.id] : [])),
    transaction
  );
  for (const credit of credits) {
    if (credit.user) {
      authors
        .get(credit.bookId)
        ?.push(
          toAuthorSummary(credit.user, avatarUrls.get(credit.user.id) ?? null)
        );
    }
  }
  return authors;
}

async function withAuthors(
  book: Book,
  transaction?: Transaction
): Promise<PublicBook> {
  const [authors, coverUrls, genres] = await Promise.all([
    loadAuthors([book.id], transaction),
    loadCoverUrls([book.id], transaction),
    loadGenres([book.genreId], transaction),
  ]);
  return toPublicBook(
    book,
    authors.get(book.id) ?? [],
    coverUrls.get(book.id) ?? null,
    genreOf(book.genreId, genres)
  );
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

  // A5: combined with the other filters by AND. An id that names no Genre
  // matches nothing and yields an empty list, as an unknown `?tag=` does.
  if (query.genreId !== undefined) {
    clauses.push({ genreId: query.genreId });
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
          await assertGenreExists(attributes.genreId, transaction);
          const seriesPosition =
            attributes.seriesId === null
              ? null
              : await nextSeriesPosition(attributes.seriesId, transaction);
          const book = await Book.create(
            { ...attributes, seriesPosition },
            { transaction }
          );
          await BookAuthor.create({ bookId: book.id, userId }, { transaction });
          return withAuthors(book, transaction);
        });
      } catch (error) {
        asMissingUser(error, input.userId);
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
        // A series' books come in Series order; every other list by id.
        order:
          query.seriesId === undefined
            ? [['id', 'ASC']]
            : [
                ['seriesPosition', 'ASC'],
                ['id', 'ASC'],
              ],
      });

      const [authors, coverUrls, genres] = await Promise.all([
        loadAuthors(rows.map((row) => row.id)),
        loadCoverUrls(rows.map((row) => row.id)),
        loadGenres(rows.map((row) => row.genreId)),
      ]);
      return {
        items: rows.map((row) =>
          toPublicBook(
            row,
            authors.get(row.id) ?? [],
            coverUrls.get(row.id) ?? null,
            genreOf(row.genreId, genres)
          )
        ),
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

    // No foreign-key mapping, unlike create: seriesId and genreId are the only
    // references an update can write, and asMissingUser explains why neither
    // can be rejected.
    async update(id, input) {
      return sequelizeOf().transaction(async (transaction) => {
        const book = await Book.findByPk(id, {
          transaction,
          lock: transaction.LOCK.UPDATE,
        });
        if (!book) return null;

        await assertGenreExists(input.genreId, transaction);

        // `update` writes only the keys present, so an omitted seriesId
        // leaves the link — and the book's place — alone, while an explicit
        // null clears both. Saving a book into the series it is already in
        // keeps its place; only a move appends it.
        const changes: UpdateBookInput & { seriesPosition?: number | null } = {
          ...input,
        };
        if (input.seriesId === null) {
          changes.seriesPosition = null;
        } else if (
          input.seriesId !== undefined &&
          input.seriesId !== book.seriesId
        ) {
          changes.seriesPosition = await nextSeriesPosition(
            input.seriesId,
            transaction
          );
        }

        await book.update(changes, { transaction });
        return withAuthors(book, transaction);
      });
    },

    // Under a lock on the book row, so the Co-authors told are exactly the ones
    // credited when it went.
    async remove(id, actor) {
      return sequelizeOf().transaction(async (transaction) => {
        const book = await Book.findByPk(id, {
          attributes: ['id', 'title'],
          transaction,
          lock: transaction.LOCK.UPDATE,
        });
        if (!book) return false;

        const coAuthorIds = (
          await BookAuthor.findAll({
            where: { bookId: id },
            attributes: ['userId'],
            transaction,
          })
        ).map((credit) => credit.userId);
        await notify(
          [
            {
              recipientIds: coAuthorIds,
              kind: 'work_deleted',
              work: { type: 'book', id: null, title: book.title },
              ...(await deleterOf(actor, coAuthorIds, transaction)),
            },
          ],
          actor.id,
          transaction
        );

        await Book.destroy({ where: { id }, transaction });
        return true;
      });
    },

    async addCoAuthor(bookId, userId, actor) {
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
        await sequelizeOf().transaction(async (transaction) => {
          await BookAuthor.create({ bookId, userId }, { transaction });
          await notify(
            [
              {
                recipientIds: [userId],
                kind: 'co_author_added',
                work: { type: 'book', id: bookId, title: book.title },
                actorKind: 'co_author',
                actorName: await displayNameOf(actor.id, transaction),
              },
            ],
            actor.id,
            transaction
          );
        });
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
    async removeCoAuthor(bookId, userId, actor) {
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
        // A Co-author leaving tells the ones who remain; one removed by
        // another is told themselves.
        const leaving = userId === actor.id;
        await notify(
          [
            {
              recipientIds: leaving
                ? credits.map((credit) => credit.userId)
                : [userId],
              kind: leaving ? 'co_author_left' : 'co_author_removed',
              work: { type: 'book', id: bookId, title: book.title },
              actorKind: 'co_author',
              actorName: await displayNameOf(actor.id, transaction),
            },
          ],
          actor.id,
          transaction
        );
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

    async listInSeries(seriesId) {
      const series = await Series.findByPk(seriesId, { attributes: ['id'] });
      if (!series) return null;

      const books = await Book.findAll({
        where: { seriesId },
        attributes: ['id', 'title', 'status'],
        order: [
          ['seriesPosition', 'ASC'],
          ['id', 'ASC'],
        ],
      });
      const authors = await loadAuthors(books.map((book) => book.id));
      return books.map((book) => ({
        id: book.id,
        title: book.title,
        status: book.status,
        authors: authors.get(book.id) ?? [],
      }));
    },

    async reorderInSeries(seriesId, bookIds) {
      return sequelizeOf().transaction(async (transaction) => {
        const series = await Series.findByPk(seriesId, {
          attributes: ['id'],
          transaction,
          lock: transaction.LOCK.UPDATE,
        });
        if (!series) return false;

        const current = await Book.findAll({
          where: { seriesId },
          attributes: ['id'],
          transaction,
          lock: transaction.LOCK.UPDATE,
        });
        const currentIds = new Set(current.map((book) => book.id));
        const sameSet =
          new Set(bookIds).size === bookIds.length &&
          bookIds.length === currentIds.size &&
          bookIds.every((bookId) => currentIds.has(bookId));
        if (!sameSet) {
          throw new StateConflictError(
            'The books of this series changed since you loaded them'
          );
        }

        // One statement, and silent, for the reasons chapterRepository.reorder
        // gives: FIELD(id, …) is each id's 1-based place, and a reorder is not
        // an edit to any book.
        await Book.update(
          { seriesPosition: fn('FIELD', col('id'), ...bookIds) },
          { where: { seriesId }, transaction, silent: true }
        );
        return true;
      });
    },

    async setCover(bookId, data) {
      const book = await Book.findByPk(bookId, { attributes: ['id'] });
      if (!book) return false;
      await BookCover.upsert({ bookId, data });
      return true;
    },

    async removeCover(bookId) {
      const book = await Book.findByPk(bookId, { attributes: ['id'] });
      if (!book) return false;
      await BookCover.destroy({ where: { bookId } });
      return true;
    },

    async getCoverData(bookId, viewer) {
      const book = await Book.findOne({
        where: { [Op.and]: [{ id: bookId }, await readableBookWhere(viewer)] },
        attributes: ['id'],
      });
      if (!book) return null;

      const cover = await BookCover.findByPk(bookId, {
        attributes: ['data', 'updatedAt'],
      });
      return cover ? { data: cover.data, updatedAt: cover.updatedAt } : null;
    },
  };
}
