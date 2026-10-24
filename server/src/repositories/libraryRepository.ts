import { ForeignKeyConstraintError, Op } from 'sequelize';
import type {
  BookLibraryState,
  LibraryBook,
  PublicLibraryEntry,
  ReadingStatus,
} from 'shared';
import { Book } from '../models/Book.ts';
import { BookAuthor } from '../models/BookAuthor.ts';
import { LibraryEntry, toPublicLibraryEntry } from '../models/LibraryEntry.ts';
import {
  ForbiddenError,
  NotFoundError,
  StateConflictError,
} from '../types/errors.ts';
import type { ListLibraryQuery } from '../types/library.ts';
import { publicBooksOf } from './bookRepository.ts';
import { joined } from './joined.ts';
import { readableBookWhere, type Account } from './visibility.ts';

export interface LibraryRepository {
  // A Book the account may not read is the same NotFoundError('Book', id) as a
  // missing one. Setting again replaces the status and refreshes updatedAt.
  set(
    bookId: number,
    status: ReadingStatus,
    account: Account
  ): Promise<PublicLibraryEntry>;
  // Add to the Library: none or Not interested becomes Plan to read, any other
  // status stays. A Co-author is refused with ForbiddenError, after the same
  // NotFoundError rule as `set`.
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
      const [entry] = await LibraryEntry.upsert({
        userId: account.id,
        bookId,
        status,
        updatedAt: new Date(),
      });
      return toPublicLibraryEntry(entry);
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

  return {
    async set(bookId, status, account) {
      await assertReadable(bookId, account);
      return save(bookId, status, account);
    },

    async addBook(bookId, account) {
      await assertMayHold(
        bookId,
        account,
        'You cannot add your own work to your Library'
      );
      // Each step is one statement guarded by the stored status, so a
      // concurrent `set` to Reading or Read is never lowered.
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
