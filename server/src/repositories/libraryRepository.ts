import { ForeignKeyConstraintError, Op, type Transaction } from 'sequelize';
import type {
  BookLibraryState,
  LibraryBook,
  ReadingStatus,
  SeriesLibraryState,
} from 'shared';
import { Book } from '../models/Book.ts';
import { BookAuthor } from '../models/BookAuthor.ts';
import { Chapter } from '../models/Chapter.ts';
import { LibraryEntry } from '../models/LibraryEntry.ts';
import { Series } from '../models/Series.ts';
import { SeriesAuthor } from '../models/SeriesAuthor.ts';
import {
  ForbiddenError,
  NotFoundError,
  StateConflictError,
} from '../types/errors.ts';
import type {
  ListLibraryQuery,
  ReadingProgressInput,
} from '../types/library.ts';
import { publicBooksOf } from './bookRepository.ts';
import { joined } from './joined.ts';
import { sequelizeOf } from './sequelizeOf.ts';
import { seriesLibraryStateOf } from './seriesLibraryState.ts';
import {
  readableBookWhere,
  visibleSeriesWhere,
  type Account,
} from './visibility.ts';

export interface LibraryRepository {
  // Add to the Library: none or Not interested becomes Plan to read, any other
  // status stays. A Book the account may not read is the same
  // NotFoundError('Book', id) as a missing one. A Co-author is refused with
  // ForbiddenError, after that NotFoundError.
  addBook(bookId: number, account: Account): Promise<BookLibraryState>;
  // Not interested on or off: none or Plan to read becomes Not interested, a
  // second press deletes the entry (status null); Reading and Read are a
  // StateConflictError. Same refusals as `addBook`.
  toggleNotInterested(
    bookId: number,
    account: Account
  ): Promise<BookLibraryState>;
  // Resolves for nothing to clear and for a missing Book; a Co-author is
  // refused with ForbiddenError.
  clear(bookId: number, account: Account): Promise<void>;
  // The Series actions run over its Published Books, leaving out the ones the
  // account co-authors; a Co-author of the Series is refused with
  // ForbiddenError, and a Series the account may not see is a NotFoundError.
  // addSeries lifts none and Not interested to Plan to read and keeps every
  // other status.
  addSeries(seriesId: number, account: Account): Promise<SeriesLibraryState>;
  // Not interested on or off: once every Book is Not interested a press
  // deletes those entries; otherwise it marks the Books with no status.
  toggleSeriesNotInterested(
    seriesId: number,
    account: Account
  ): Promise<SeriesLibraryState>;
  // Deletes the entries of all of them, whatever the status.
  clearSeries(seriesId: number, account: Account): Promise<SeriesLibraryState>;
  // A reader opened or finished a Chapter. The Book is checked like `addBook`
  // (404 Book, then 403 Co-author), then the Chapter must be a Published one of
  // this Book (404 Chapter). opened: none, Plan to read and Not interested
  // become Reading. finished: on the last Published Chapter of a Complete Book
  // the status becomes Read, anywhere else nothing happens. Never lowers.
  recordProgress(
    bookId: number,
    input: ReadingProgressInput,
    account: Account
  ): Promise<void>;
  // Newest change first, Published Books only; without a status filter, Not
  // interested entries are left out.
  list(
    query: ListLibraryQuery,
    account: Account
  ): Promise<{ items: LibraryBook[]; total: number }>;
}

export function createSequelizeLibraryRepository(): LibraryRepository {
  // A Book the account may not read answers exactly as a missing one, so a
  // refusal never reveals that a Draft exists.
  async function assertReadable(bookId: number, account: Account) {
    const book = await Book.findOne({
      where: { [Op.and]: [{ id: bookId }, await readableBookWhere(account)] },
      attributes: ['id'],
    });
    if (!book) throw new NotFoundError('Book', bookId);
  }

  async function assertNotCoAuthor(
    bookId: number,
    account: Account,
    message: string
  ) {
    const credited = await BookAuthor.count({
      where: { bookId, userId: account.id },
    });
    if (credited > 0) throw new ForbiddenError(message);
  }

  async function assertMayHold(
    bookId: number,
    account: Account,
    message: string
  ) {
    await assertReadable(bookId, account);
    await assertNotCoAuthor(bookId, account, message);
  }

  async function save(bookId: number, status: ReadingStatus, account: Account) {
    try {
      // An upsert on the unique (userId, bookId) index: never a conflict, and
      // updatedAt moves even when the status is unchanged.
      await LibraryEntry.upsert({
        userId: account.id,
        bookId,
        status,
        updatedAt: new Date(),
      });
    } catch (error) {
      // The Book went away after the check.
      if (error instanceof ForeignKeyConstraintError) {
        throw new NotFoundError('Book', bookId);
      }
      throw error;
    }
  }

  const ownedBy = (bookId: number, account: Account) => ({
    userId: account.id,
    bookId,
  });

  const held = (bookId: number, account: Account) =>
    LibraryEntry.findOne({ where: ownedBy(bookId, account) });

  // Creates the entry unless one exists; true when it created it.
  async function insertIfAbsent(
    bookId: number,
    status: ReadingStatus,
    account: Account
  ) {
    try {
      const [, created] = await LibraryEntry.findOrCreate({
        where: ownedBy(bookId, account),
        defaults: {
          ...ownedBy(bookId, account),
          status,
          updatedAt: new Date(),
        },
      });
      return created;
    } catch (error) {
      if (error instanceof ForeignKeyConstraintError) {
        throw new NotFoundError('Book', bookId);
      }
      throw error;
    }
  }

  async function assertMayHoldSeries(
    seriesId: number,
    account: Account,
    message: string
  ) {
    const series = await Series.findOne({
      where: {
        [Op.and]: [{ id: seriesId }, await visibleSeriesWhere(account)],
      },
      attributes: ['id'],
    });
    if (!series) throw new NotFoundError('Series', seriesId);
    const credited = await SeriesAuthor.count({
      where: { seriesId, userId: account.id },
    });
    if (credited > 0) throw new ForbiddenError(message);
  }

  // The Published Books of the Series the account does not co-author.
  async function publishedBooksOf(seriesId: number, accountId: number) {
    const books = await Book.findAll({
      where: { seriesId, status: { [Op.ne]: 'draft' } },
      attributes: ['id'],
    });
    const bookIds = books.map((book) => book.id);
    if (bookIds.length === 0) return [];
    const own = await BookAuthor.findAll({
      where: { userId: accountId, bookId: bookIds },
      attributes: ['bookId'],
    });
    const ownIds = new Set(own.map((credit) => credit.bookId));
    return bookIds.filter((id) => !ownIds.has(id));
  }

  // A Series action: the writes run in one transaction over the Books it
  // reaches, and are conditional on the stored status like the Book actions.
  async function actOnSeries(
    seriesId: number,
    account: Account,
    message: string,
    write: (bookIds: number[], transaction: Transaction) => Promise<void>
  ) {
    await assertMayHoldSeries(seriesId, account, message);
    const bookIds = await publishedBooksOf(seriesId, account.id);
    if (bookIds.length > 0) {
      await sequelizeOf(LibraryEntry).transaction((transaction) =>
        write(bookIds, transaction)
      );
    }
    return seriesLibraryStateOf(seriesId, account.id);
  }

  // Inserts the rows missing; an existing entry keeps its status.
  const insertMissing = (
    bookIds: number[],
    status: ReadingStatus,
    account: Account,
    transaction: Transaction
  ) =>
    LibraryEntry.bulkCreate(
      bookIds.map((bookId) => ({
        ...ownedBy(bookId, account),
        status,
        updatedAt: new Date(),
      })),
      { ignoreDuplicates: true, transaction }
    );

  return {
    async addBook(bookId, account) {
      await assertMayHold(
        bookId,
        account,
        'You cannot add your own work to your Library'
      );
      // Each step is one statement guarded by the stored status, so a
      // concurrent write of Reading or Read is never lowered.
      await insertIfAbsent(bookId, 'plan_to_read', account);
      await LibraryEntry.update(
        { status: 'plan_to_read', updatedAt: new Date() },
        { where: { ...ownedBy(bookId, account), status: 'not_interested' } }
      );
      const status = (await held(bookId, account))?.status ?? 'plan_to_read';
      return { bookId, status };
    },

    async toggleNotInterested(bookId, account) {
      await assertMayHold(
        bookId,
        account,
        'You cannot mark your own work as not interested'
      );
      // Conditional writes on the stored status, as in `addBook`.
      if (await insertIfAbsent(bookId, 'not_interested', account)) {
        return { bookId, status: 'not_interested' };
      }
      const [marked] = await LibraryEntry.update(
        { status: 'not_interested', updatedAt: new Date() },
        { where: { ...ownedBy(bookId, account), status: 'plan_to_read' } }
      );
      if (marked > 0) return { bookId, status: 'not_interested' };
      const cleared = await LibraryEntry.destroy({
        where: { ...ownedBy(bookId, account), status: 'not_interested' },
      });
      if (cleared > 0) return { bookId, status: null };
      // Neither matched: Reading or Read, or the entry was removed meanwhile.
      if (await held(bookId, account)) {
        throw new StateConflictError('Remove it from your Library first');
      }
      return this.toggleNotInterested(bookId, account);
    },

    async clear(bookId, account) {
      await assertNotCoAuthor(
        bookId,
        account,
        'You cannot remove your own work from your Library'
      );
      await LibraryEntry.destroy({ where: { userId: account.id, bookId } });
    },

    addSeries(seriesId, account) {
      return actOnSeries(
        seriesId,
        account,
        'You cannot add your own work to your Library',
        async (bookIds, transaction) => {
          await insertMissing(bookIds, 'plan_to_read', account, transaction);
          await LibraryEntry.update(
            { status: 'plan_to_read', updatedAt: new Date() },
            {
              where: {
                userId: account.id,
                bookId: bookIds,
                status: 'not_interested',
              },
              transaction,
            }
          );
        }
      );
    },

    toggleSeriesNotInterested(seriesId, account) {
      return actOnSeries(
        seriesId,
        account,
        'You cannot mark your own work as not interested',
        async (bookIds, transaction) => {
          // Decided in the transaction over the Books this account can hold, so
          // a co-authored Book (which never has an entry) does not block it.
          const marked = await LibraryEntry.count({
            where: {
              userId: account.id,
              bookId: bookIds,
              status: 'not_interested',
            },
            transaction,
          });
          if (marked < bookIds.length) {
            await insertMissing(
              bookIds,
              'not_interested',
              account,
              transaction
            );
            return;
          }
          await LibraryEntry.destroy({
            where: {
              userId: account.id,
              bookId: bookIds,
              status: 'not_interested',
            },
            transaction,
          });
        }
      );
    },

    clearSeries(seriesId, account) {
      return actOnSeries(
        seriesId,
        account,
        'You cannot remove your own work from your Library',
        async (bookIds, transaction) => {
          await LibraryEntry.destroy({
            where: { userId: account.id, bookId: bookIds },
            transaction,
          });
        }
      );
    },

    async recordProgress(bookId, input, account) {
      await assertMayHold(
        bookId,
        account,
        'You cannot track reading progress on your own work'
      );
      const published = {
        bookId,
        publishedAt: { [Op.lte]: new Date() },
      };
      const chapter = await Chapter.findOne({
        where: { id: input.chapterId, ...published },
        attributes: ['id'],
      });
      if (!chapter) throw new NotFoundError('Chapter', input.chapterId);

      if (input.event === 'opened') {
        // Conditional statements, as in `addBook`: a concurrent write or
        // `finished` is never lowered to reading.
        await insertIfAbsent(bookId, 'reading', account);
        await LibraryEntry.update(
          { status: 'reading', updatedAt: new Date() },
          {
            where: {
              ...ownedBy(bookId, account),
              status: { [Op.in]: ['plan_to_read', 'not_interested'] },
            },
          }
        );
        return;
      }

      const last = await Chapter.findOne({
        where: published,
        order: [
          ['position', 'DESC'],
          ['id', 'DESC'],
        ],
        attributes: ['id'],
      });
      const book = await Book.findByPk(bookId, { attributes: ['status'] });
      if (book?.status === 'complete' && last?.id === input.chapterId) {
        await save(bookId, 'read', account);
      }
    },

    async list(query, account) {
      // The status filter sits on the join, so a Draft Book leaves `total`
      // too, for everyone.
      const { rows, count } = await LibraryEntry.findAndCountAll({
        where: {
          userId: account.id,
          status: query.status ?? { [Op.ne]: 'not_interested' },
        },
        include: [
          {
            model: Book,
            as: 'book',
            required: true,
            where: { status: { [Op.ne]: 'draft' } },
          },
        ],
        limit: query.pageSize,
        offset: (query.current - 1) * query.pageSize,
        order: [
          ['updatedAt', 'DESC'],
          ['id', 'DESC'],
        ],
      });

      const books = await publicBooksOf(rows.map((row) => joined(row.book)));
      return {
        items: rows.map((row, index) => ({
          ...joined(books[index]),
          readingStatus: row.status,
        })),
        total: count,
      };
    },
  };
}
