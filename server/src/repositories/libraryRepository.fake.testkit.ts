import { NotFoundError } from '../types/errors.ts';
import type { PublicBook, ReadingStatus } from 'shared';
import { aPublicBook } from './favoriteRepository.fake.testkit.ts';
import type { LibraryRepository } from './libraryRepository.ts';

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

  return {
    async set(bookId, status, account) {
      const book = books.get(bookId);
      const mayRead =
        book &&
        (book.status !== 'draft' ||
          book.authors.some((author) => author.id === account.id));
      if (!mayRead) throw new NotFoundError('Book', bookId);
      // Stands in for the foreign key on userId.
      if (!accounts.has(account.id)) {
        throw new NotFoundError('User', account.id);
      }
      const entry = {
        userId: account.id,
        bookId,
        status,
        updatedAt: new Date(),
      };
      entries.set(`${account.id}:${bookId}`, entry);
      return { bookId, status, updatedAt: entry.updatedAt };
    },

    async clear(bookId, accountId) {
      entries.delete(`${accountId}:${bookId}`);
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
