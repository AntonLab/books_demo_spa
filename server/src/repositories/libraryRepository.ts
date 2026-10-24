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
import { User } from '../models/User.ts';
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
import {
  assertReadableBook,
  assertVisibleSeries,
  isCoAuthorOfBook,
  isCoAuthorOfSeries,
} from './holdGuards.ts';
import { joined } from './joined.ts';
import {
  ADD_OWN_WORK,
  NOT_INTERESTED_OWN_WORK,
  PROGRESS_OWN_WORK,
  REMOVE_FROM_LIBRARY_FIRST,
} from './libraryMessages.ts';
import { sequelizeOf } from './sequelizeOf.ts';
import { seriesLibraryStateOf } from './seriesLibraryState.ts';
import type { Account } from './visibility.ts';

export interface LibraryRepository {
  // Add to the Library: none or Not interested becomes Plan to read, any other
  // status stays. A Book the account may not read is the same
  // NotFoundError('Book', id) as a missing one. A Co-author is refused with
  // ForbiddenError, after that NotFoundError.
  addBook(bookId: number, account: Account): Promise<BookLibraryState>;
  // Not interested on or off: none or Plan to read becomes Not interested, a
  // second press deletes the entry (status null); Reading and Read, or a race
  // lost three times, are a StateConflictError. Same refusals as `addBook`.
  toggleNotInterested(
    bookId: number,
    account: Account
  ): Promise<BookLibraryState>;
  // Resolves for nothing to clear and for a missing Book; a Co-author may
  // clear a leftover entry.
  clear(bookId: number, account: Account): Promise<void>;
  // The Series actions run over its Published Books, leaving out the ones the
  // account co-authors; a Co-author of the Series is refused with
  // ForbiddenError, and a Series the account may not see is a NotFoundError.
  // addSeries lifts none and Not interested to Plan to read and keeps every
  // other status. clearSeries is the exception: it reaches every Published
  // Book, co-authored ones too, and a Co-author of the Series may call it.
  addSeries(seriesId: number, account: Account): Promise<SeriesLibraryState>;
  // Not interested on or off: once every Book is Not interested a press
  // deletes those entries; otherwise it marks the Books with no status.
  toggleSeriesNotInterested(
    seriesId: number,
    account: Account
  ): Promise<SeriesLibraryState>;
  // Deletes the entries of every Published Book, whatever the status.
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

const TOGGLE_ATTEMPTS = 3;

export function createSequelizeLibraryRepository(): LibraryRepository {
  async function assertMayHold(
    bookId: number,
    account: Account,
    message: string
  ) {
    await assertReadableBook(bookId, account);
    if (await isCoAuthorOfBook(bookId, account)) {
      throw new ForbiddenError(message);
    }
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

  // Creates the entry unless one exists. A single autocommit INSERT IGNORE:
  // findOrCreate's SELECT then INSERT in one transaction takes gap locks that
  // concurrent presses on a missing entry waited on until the lock timeout.
  async function insertIfAbsent(
    bookId: number,
    status: ReadingStatus,
    account: Account
  ) {
    await LibraryEntry.bulkCreate(
      [{ ...ownedBy(bookId, account), status, updatedAt: new Date() }],
      { ignoreDuplicates: true }
    );
  }

  // The entry after an insert. None means the insert was ignored because the
  // Book went away (INSERT IGNORE downgrades the foreign key error): a 404.
  async function heldAfterInsert(bookId: number, account: Account) {
    const entry = await held(bookId, account);
    if (!entry) await assertReadableBook(bookId, account);
    return entry;
  }

  async function assertMayHoldSeries(
    seriesId: number,
    account: Account,
    // Without a message a Co-author is not refused.
    message?: string
  ) {
    await assertVisibleSeries(seriesId, account);
    if (message && (await isCoAuthorOfSeries(seriesId, account))) {
      throw new ForbiddenError(message);
    }
  }

  // The Published Books of the Series; without `withOwn`, those the account
  // co-authors are left out.
  async function publishedBooksOf(
    seriesId: number,
    account: Account,
    withOwn: boolean
  ) {
    const books = await Book.findAll({
      where: { seriesId, status: { [Op.ne]: 'draft' } },
      attributes: ['id'],
    });
    const bookIds = books.map((book) => book.id);
    if (withOwn || bookIds.length === 0) return bookIds;
    const own = await BookAuthor.findAll({
      where: { userId: account.id, bookId: bookIds },
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
    // refuseCoAuthor: the refusal text for a Co-author, none lets one through;
    // includeOwn: also reach the Books the account co-authors.
    {
      refuseCoAuthor,
      includeOwn = false,
    }: { refuseCoAuthor?: string; includeOwn?: boolean },
    write: (bookIds: number[], transaction: Transaction) => Promise<void>
  ) {
    await assertMayHoldSeries(seriesId, account, refuseCoAuthor);
    const bookIds = await publishedBooksOf(seriesId, account, includeOwn);
    if (bookIds.length > 0) {
      await sequelizeOf(LibraryEntry).transaction((transaction) =>
        write(bookIds, transaction)
      );
    }
    return seriesLibraryStateOf(seriesId, account.id);
  }

  // Inserts the rows missing; an existing entry keeps its status.
  async function insertMissing(
    bookIds: number[],
    status: ReadingStatus,
    account: Account,
    transaction: Transaction
  ) {
    // INSERT IGNORE also swallows a foreign key failure, so the Account is
    // checked, and held against deletion until commit, first.
    const holder = await User.findByPk(account.id, {
      attributes: ['id'],
      lock: transaction.LOCK.SHARE,
      transaction,
    });
    if (!holder) throw new NotFoundError('User', account.id);
    await LibraryEntry.bulkCreate(
      bookIds.map((bookId) => ({
        ...ownedBy(bookId, account),
        status,
        updatedAt: new Date(),
      })),
      { ignoreDuplicates: true, transaction }
    );
  }

  return {
    async addBook(bookId, account) {
      await assertMayHold(bookId, account, ADD_OWN_WORK);
      // Each step is one statement guarded by the stored status, so a
      // concurrent write of Reading or Read is never lowered.
      await insertIfAbsent(bookId, 'plan_to_read', account);
      await LibraryEntry.update(
        { status: 'plan_to_read', updatedAt: new Date() },
        { where: { ...ownedBy(bookId, account), status: 'not_interested' } }
      );
      const status =
        (await heldAfterInsert(bookId, account))?.status ?? 'plan_to_read';
      return { bookId, status };
    },

    async toggleNotInterested(bookId, account) {
      await assertMayHold(bookId, account, NOT_INTERESTED_OWN_WORK);
      // A lost race (the entry removed between two statements) tries again, a
      // bounded number of times.
      for (let attempt = 0; attempt < TOGGLE_ATTEMPTS; attempt += 1) {
        const [marked] = await LibraryEntry.update(
          { status: 'not_interested', updatedAt: new Date() },
          { where: { ...ownedBy(bookId, account), status: 'plan_to_read' } }
        );
        if (marked > 0) return { bookId, status: 'not_interested' };
        const cleared = await LibraryEntry.destroy({
          where: { ...ownedBy(bookId, account), status: 'not_interested' },
        });
        if (cleared > 0) return { bookId, status: null };
        // Neither matched: the entry is missing, or Reading or Read.
        await insertIfAbsent(bookId, 'not_interested', account);
        const entry = await held(bookId, account);
        if (entry?.status === 'not_interested') {
          return { bookId, status: 'not_interested' };
        }
        if (entry && entry.status !== 'plan_to_read') break;
      }
      // A Book deleted meanwhile is a 404, not a conflict.
      await assertReadableBook(bookId, account);
      throw new StateConflictError(REMOVE_FROM_LIBRARY_FIRST);
    },

    async clear(bookId, account) {
      await LibraryEntry.destroy({ where: { userId: account.id, bookId } });
    },

    addSeries(seriesId, account) {
      return actOnSeries(
        seriesId,
        account,
        { refuseCoAuthor: ADD_OWN_WORK },
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
        { refuseCoAuthor: NOT_INTERESTED_OWN_WORK },
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
        { includeOwn: true },
        async (bookIds, transaction) => {
          await LibraryEntry.destroy({
            where: { userId: account.id, bookId: bookIds },
            transaction,
          });
        }
      );
    },

    async recordProgress(bookId, input, account) {
      await assertMayHold(bookId, account, PROGRESS_OWN_WORK);
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
        // Guarded by the stored status: a concurrent finished is never lowered.
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
        // Called for its 404 only.
        await heldAfterInsert(bookId, account);
        return;
      }

      // Benign without a transaction: a Chapter published or a Book completed
      // between these reads only moves "last" to what a retry would see.
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
