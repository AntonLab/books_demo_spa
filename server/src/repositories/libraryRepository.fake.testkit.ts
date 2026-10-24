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
  // The Series that exist; a Book's `seriesId` links it. Every one is visible
  // here, as the fake knows no Series visibility rule.
  series?: Map<number, { authorIds: number[] }>;
  // The Chapters that exist; a null `publishedAt` is not Published.
  chapters?: Array<{
    id: number;
    bookId: number;
    position: number;
    publishedAt: Date | null;
  }>;
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
  options: {
    draft?: boolean;
    complete?: boolean;
    authorIds?: number[];
    seriesId?: number;
  } = {}
): PublicBook {
  const {
    draft = false,
    complete = false,
    authorIds = [],
    seriesId = null,
  } = options;
  return {
    ...aPublicBook(id),
    seriesId,
    status: draft ? 'draft' : complete ? 'complete' : 'in_progress',
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
    series = new Map<number, { authorIds: number[] }>(),
    chapters = [],
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

  function assertMayHoldSeries(
    seriesId: number,
    account: Account,
    message: string
  ) {
    const row = series.get(seriesId);
    if (!row) throw new NotFoundError('Series', seriesId);
    if (row.authorIds.includes(account.id)) throw new ForbiddenError(message);
  }

  const publishedIn = (seriesId: number) =>
    [...books.values()].filter(
      (book) => book.seriesId === seriesId && book.status !== 'draft'
    );

  // The Published Books of a Series the account does not co-author.
  const holdableIn = (seriesId: number, account: Account) =>
    publishedIn(seriesId)
      .map((book) => book.id)
      .filter((id) => !isCoAuthor(id, account));

  const statusOf = (bookId: number, account: Account) =>
    entries.get(`${account.id}:${bookId}`)?.status;

  function seriesStateOf(seriesId: number, account: Account) {
    const statuses = publishedIn(seriesId).map((book) =>
      statusOf(book.id, account)
    );
    return {
      inLibrary: statuses.some(
        (s) => s !== undefined && s !== 'not_interested'
      ),
      notInterested:
        statuses.length > 0 && statuses.every((s) => s === 'not_interested'),
    };
  }

  const drop = (bookIds: number[], account: Account) =>
    bookIds.forEach((id) => entries.delete(`${account.id}:${id}`));

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

    async addSeries(seriesId, account) {
      assertMayHoldSeries(
        seriesId,
        account,
        'You cannot add your own work to your Library'
      );
      for (const id of holdableIn(seriesId, account)) {
        const status = statusOf(id, account);
        if (status === undefined || status === 'not_interested') {
          save(id, 'plan_to_read', account);
        }
      }
      return seriesStateOf(seriesId, account);
    },

    async toggleSeriesNotInterested(seriesId, account) {
      assertMayHoldSeries(
        seriesId,
        account,
        'You cannot mark your own work as not interested'
      );
      const ids = holdableIn(seriesId, account);
      const allMarked =
        ids.length > 0 &&
        ids.every((id) => statusOf(id, account) === 'not_interested');
      if (allMarked) {
        drop(ids, account);
      } else {
        for (const id of ids) {
          if (statusOf(id, account) === undefined) {
            save(id, 'not_interested', account);
          }
        }
      }
      return seriesStateOf(seriesId, account);
    },

    async clearSeries(seriesId, account) {
      assertMayHoldSeries(
        seriesId,
        account,
        'You cannot remove your own work from your Library'
      );
      drop(holdableIn(seriesId, account), account);
      return seriesStateOf(seriesId, account);
    },

    async recordProgress(bookId, input, account) {
      assertMayHold(
        bookId,
        account,
        'You cannot track reading progress on your own work'
      );
      const now = Date.now();
      const published = chapters
        .filter(
          (chapter) =>
            chapter.bookId === bookId &&
            chapter.publishedAt !== null &&
            chapter.publishedAt.getTime() <= now
        )
        .sort((a, b) => b.position - a.position || b.id - a.id);
      if (!published.some((chapter) => chapter.id === input.chapterId)) {
        throw new NotFoundError('Chapter', input.chapterId);
      }
      const status = statusOf(bookId, account);
      if (input.event === 'opened') {
        if (
          status === undefined ||
          status === 'plan_to_read' ||
          status === 'not_interested'
        ) {
          save(bookId, 'reading', account);
        }
        return;
      }
      if (
        books.get(bookId)?.status === 'complete' &&
        published[0]?.id === input.chapterId
      ) {
        save(bookId, 'read', account);
      }
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
