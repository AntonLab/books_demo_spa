import { ConflictError, NotFoundError } from '../types/errors.ts';
import type { PublicBook, PublicFavorite, PublicSeries } from 'shared';
import type { FavoriteRepository } from './favoriteRepository.ts';

export interface FakeFavoriteRepositoryOptions {
  // The accounts that exist. Stands in for users.id.
  accounts?: ReadonlySet<number>;
  // The books that exist, as a list row embeds them.
  books?: ReadonlyMap<number, PublicBook>;
  // The series that exist, as a list row embeds them.
  series?: ReadonlyMap<number, PublicSeries>;
  // Favorites already there.
  seed?: PublicFavorite[];
}

const FIXTURE_TIME = new Date('2026-01-01T00:00:00Z');

// A minimal PublicBook for a fake's seeds; only the id matters to a contract.
export function aPublicBook(id: number): PublicBook {
  return {
    id,
    authors: [],
    seriesId: null,
    series: null,
    title: `Book ${id}`,
    description: '',
    tags: [],
    status: 'in_progress',
    genre: null,
    coverUrl: null,
    createdAt: FIXTURE_TIME,
    updatedAt: FIXTURE_TIME,
  };
}

// A minimal PublicSeries, on the same terms.
export function aPublicSeries(id: number): PublicSeries {
  return {
    id,
    authors: [],
    title: `Series ${id}`,
    coverUrl: null,
    bookCount: 0,
    description: '',
    tags: [],
    genre: null,
    createdAt: FIXTURE_TIME,
    updatedAt: FIXTURE_TIME,
  };
}

// An in-memory FavoriteRepository for the route specs, held to the real one by
// favoriteRepository.contract.testkit.ts. It emulates the foreign keys and the
// unique indexes only: Draft books and series visibility stay in the real
// repository and are proven against MySQL.
export function createFakeFavoriteRepository(
  options: FakeFavoriteRepositoryOptions = {}
): FavoriteRepository {
  const {
    accounts = new Set(),
    books = new Map(),
    series = new Map(),
    seed = [],
  } = options;
  const rows = new Map<number, PublicFavorite>(
    seed.map((row) => [row.id, row])
  );
  let nextId = 1;

  const ownNewestFirst = (accountId: number): PublicFavorite[] =>
    [...rows.values()]
      .filter((row) => row.userId === accountId)
      .sort((a, b) => b.id - a.id);

  return {
    async create(input, account) {
      // The target first, as the real repository looks it up before the insert.
      if (input.bookId !== null && !books.has(input.bookId)) {
        throw new NotFoundError('Book', input.bookId);
      }
      if (input.seriesId !== null && !series.has(input.seriesId)) {
        throw new NotFoundError('Series', input.seriesId);
      }
      // Stand in for the foreign key on userId and the two unique indexes.
      if (!accounts.has(account.id)) {
        throw new NotFoundError('User', account.id);
      }
      const taken = [...rows.values()].some(
        (row) =>
          row.userId === account.id &&
          row.bookId === input.bookId &&
          row.seriesId === input.seriesId
      );
      if (taken) throw new ConflictError('favorite');

      while (rows.has(nextId)) nextId += 1;
      const favorite: PublicFavorite = {
        id: nextId,
        userId: account.id,
        bookId: input.bookId,
        seriesId: input.seriesId,
        createdAt: new Date(),
      };
      rows.set(favorite.id, favorite);
      return favorite;
    },

    async remove(id, accountId) {
      if (rows.get(id)?.userId !== accountId) return false;
      return rows.delete(id);
    },

    async listBooks(query, account) {
      const matching = ownNewestFirst(account.id).flatMap((row) => {
        const book = row.bookId === null ? undefined : books.get(row.bookId);
        return book ? [{ id: row.id, createdAt: row.createdAt, book }] : [];
      });
      return {
        items: matching.slice(query.offset, query.offset + query.limit),
        total: matching.length,
      };
    },

    async listSeries(query, account) {
      const matching = ownNewestFirst(account.id).flatMap((row) => {
        const found =
          row.seriesId === null ? undefined : series.get(row.seriesId);
        return found
          ? [{ id: row.id, createdAt: row.createdAt, series: found }]
          : [];
      });
      return {
        items: matching.slice(query.offset, query.offset + query.limit),
        total: matching.length,
      };
    },
  };
}
