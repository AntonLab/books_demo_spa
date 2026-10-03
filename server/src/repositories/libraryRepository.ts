import { ForeignKeyConstraintError, Op } from 'sequelize';
import type { LibraryBook, PublicLibraryEntry, ReadingStatus } from 'shared';
import { Book } from '../models/Book.ts';
import { LibraryEntry, toPublicLibraryEntry } from '../models/LibraryEntry.ts';
import { NotFoundError } from '../types/errors.ts';
import type { ListLibraryQuery } from '../types/library.ts';
import { publicBooksOf } from './bookRepository.ts';
import { joined } from './joined.ts';
import { readableBookWhere, type Viewer } from './visibility.ts';

// The signed-in account a Library belongs to. Never a Guest: every route that
// reaches this repository is guarded.
export type Account = NonNullable<Viewer>;

export interface LibraryRepository {
  // A Book the account may not read is the same NotFoundError('Book', id) as a
  // missing one. Setting again replaces the status and refreshes updatedAt.
  set(
    bookId: number,
    status: ReadingStatus,
    account: Account
  ): Promise<PublicLibraryEntry>;
  // Always resolves: clearing nothing, or a missing Book, is not an error.
  clear(bookId: number, accountId: number): Promise<void>;
  // Newest change first, Published Books only; without a status filter, Not
  // interested entries are left out.
  list(
    query: ListLibraryQuery,
    account: Account
  ): Promise<{ items: LibraryBook[]; total: number }>;
}

export function createSequelizeLibraryRepository(): LibraryRepository {
  return {
    async set(bookId, status, account) {
      // A Book the account may not read answers exactly as a missing one, so a
      // refusal never reveals that a Draft exists.
      const book = await Book.findOne({
        where: { [Op.and]: [{ id: bookId }, await readableBookWhere(account)] },
        attributes: ['id'],
      });
      if (!book) throw new NotFoundError('Book', bookId);

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
        // The Book went away after the check above.
        if (error instanceof ForeignKeyConstraintError) {
          throw new NotFoundError('Book', bookId);
        }
        throw error;
      }
    },

    async clear(bookId, accountId) {
      await LibraryEntry.destroy({ where: { userId: accountId, bookId } });
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
