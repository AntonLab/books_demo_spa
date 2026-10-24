import {
  ForbiddenError,
  NotFoundError,
  StateConflictError,
} from '../types/errors.ts';
import { isModeratorRole, type PublicBook, type ReadingStatus } from 'shared';
import { aPublicBook } from './favoriteRepository.fake.testkit.ts';
import type { LibraryRepository } from './libraryRepository.ts';
import type { Account } from './visibility.ts';

export interface FakeLibraryRepositoryOptions {
  // The accounts that exist. Stands in for users.id.
  accounts?: ReadonlySet<number>;
  // The books that exist, as a list row embeds them.
  books?: Map<number, PublicBook>;
  // Library entries already there, in insertion order.
  seed?: Array<{
    userId: number;
    bookId: number;
    status: ReadingStatus;
    updatedAt: Date;
  }>;
}

// A minimal PublicBook for a fake's seeds, credited to `authorIds`.
export function aLibraryBook(
  id: number,
  options: { draft?: boolean; authorIds?: number[] } = {}
): PublicBook {
  const { draft = false, authorIds = [] } = options;
  return {
    ...aPublicBook(id),
    status: draft ? 'draft' : 'in_progress',
    authors: authorIds.map((authorId) => ({
      id: authorId,
      login: `author${authorId}`,
      firstName: 'Author',
      lastName: `${authorId}`,
      status: 'active',
      avatarUrl: null,
    })),
  };
}

// An in-memory LibraryRepository for the route specs, held to the real one by
// libraryRepository.contract.testkit.ts.
export function createFakeLibraryRepository(
  options: FakeLibraryRepositoryOptions = {}
): LibraryRepository {
  const {
    accounts = new Set<number>(),
    books = new Map<number, PublicBook>(),
    seed = [],
  } = options;
  // Keyed by "userId:bookId"; a Map keeps insertion order for ties.
  const entries = new Map(
    seed.map((row) => [`${row.userId}:${row.bookId}`, row])
  );

  const isCoAuthor = (bookId: number, account: Account) =>
    books.get(bookId)?.authors.some((author) => author.id === account.id) ??
    false;

  function assertMayHold(bookId: number, account: Account, message: string) {
    const book = books.get(bookId);
    const mayRead =
      book &&
      (book.status !== 'draft' ||
        isModeratorRole(account.role) ||
        isCoAuthor(bookId, account));
    if (!mayRead) throw new NotFoundError('Book', bookId);
    if (isCoAuthor(bookId, account)) throw new ForbiddenError(message);
  }

  function save(bookId: number, status: ReadingStatus, account: Account) {
    // Stands in for the foreign key on userId.
    if (!accounts.has(account.id)) {
      throw new NotFoundError('User', account.id);
    }
    const entry = { userId: account.id, bookId, status, updatedAt: new Date() };
    entries.set(`${account.id}:${bookId}`, entry);
    return { bookId, status, updatedAt: entry.updatedAt };
  }

  return {
    async set(bookId, status, account) {
      const book = books.get(bookId);
      const mayRead =
        book &&
        (book.status !== 'draft' ||
          isModeratorRole(account.role) ||
          isCoAuthor(bookId, account));
      if (!mayRead) throw new NotFoundError('Book', bookId);
      return save(bookId, status, account);
    },

    async addBook(bookId, account) {
      assertMayHold(
        bookId,
        account,
        'You cannot add your own work to your Library'
      );
      const status = entries.get(`${account.id}:${bookId}`)?.status;
      if (status && status !== 'not_interested') return { bookId, status };
      return { bookId, status: save(bookId, 'plan_to_read', account).status };
    },

    async toggleNotInterested(bookId, account) {
      assertMayHold(
        bookId,
        account,
        'You cannot mark your own work as not interested'
      );
      const status = entries.get(`${account.id}:${bookId}`)?.status;
      if (status === 'reading' || status === 'read') {
        throw new StateConflictError('Remove it from your Library first');
      }
      if (status === 'not_interested') {
        entries.delete(`${account.id}:${bookId}`);
        return { bookId, status: null };
      }
      return { bookId, status: save(bookId, 'not_interested', account).status };
    },

    async clear(bookId, account) {
      if (isCoAuthor(bookId, account)) {
        throw new ForbiddenError(
          'You cannot remove your own work from your Library'
        );
      }
      entries.delete(`${account.id}:${bookId}`);
    },

    async list(query, account) {
      const matching = [...entries.values()]
        .map((entry, order) => ({ entry, order }))
        .filter(
          ({ entry }) =>
            entry.userId === account.id &&
            (query.status
              ? entry.status === query.status
              : entry.status !== 'not_interested')
        )
        .sort(
          (a, b) =>
            b.entry.updatedAt.getTime() - a.entry.updatedAt.getTime() ||
            b.order - a.order
        )
        .flatMap(({ entry }) => {
          const book = books.get(entry.bookId);
          return book && book.status !== 'draft'
            ? [{ ...book, readingStatus: entry.status }]
            : [];
        });
      const start = (query.current - 1) * query.pageSize;
      return {
        items: matching.slice(start, start + query.pageSize),
        total: matching.length,
      };
    },
  };
}
