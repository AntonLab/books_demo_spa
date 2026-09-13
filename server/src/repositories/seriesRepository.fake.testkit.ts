import { NotFoundError } from '../types/errors.ts';
import type { PublicSeries } from '../types/series.ts';
import type { AuthorSummary } from '../types/user.ts';
import type { Actor } from './notificationRepository.ts';
import type { SeriesListResult, SeriesRepository } from './seriesRepository.ts';

export interface FakeSeriesRepositoryOptions {
  // The accounts that exist, by id. Stands in for users.id: a credit naming
  // anyone else is refused, and a response's `authors` carries these
  // summaries.
  accounts?: ReadonlyMap<number, AuthorSummary>;
  // bookId -> the series it is filed in, or null. Stands in for the books
  // table, which this repository only unlinks from: removeBook writes to the
  // map, so give each fake a map of its own.
  books?: Map<number, number | null>;
  // Who made each credit change or delete.
  actors?: [string, Actor][];
}

// An in-memory SeriesRepository for the route specs, held to the real one by
// seriesRepository.contract.testkit.ts on the parts the controllers rely on.
//
// The domain rules stay in the real repository and are covered against MySQL:
// every series is visible here, credits are not checked against the Author
// role, duplicates or the last Co-author, and nobody is notified.
export function createFakeSeriesRepository(
  options: FakeSeriesRepositoryOptions = {}
): SeriesRepository {
  const { accounts = new Map(), books = new Map(), actors = [] } = options;
  const rows = new Map<number, PublicSeries>();
  // seriesId -> co-author ids, in credit order.
  const credits = new Map<number, number[]>();
  let nextId = 1;

  const withCredits = (series: PublicSeries): PublicSeries => ({
    ...series,
    authors: (credits.get(series.id) ?? []).flatMap(
      (id) => accounts.get(id) ?? []
    ),
  });

  return {
    async create(input) {
      // Stands in for the foreign key: the real repository maps MySQL's
      // rejection to this same NotFoundError.
      if (!accounts.has(input.userId)) {
        throw new NotFoundError('User', input.userId);
      }

      const now = new Date();
      const series: PublicSeries = {
        id: nextId,
        authors: [],
        title: input.title,
        description: input.description,
        tags: input.tags,
        createdAt: now,
        updatedAt: now,
      };
      nextId += 1;
      rows.set(series.id, series);
      credits.set(series.id, [input.userId]);
      return withCredits(series);
    },

    async list(query): Promise<SeriesListResult> {
      const matching = [...rows.values()].filter(
        (row) =>
          (query.userId === undefined ||
            (credits.get(row.id) ?? []).includes(query.userId)) &&
          (!query.tag || row.tags.includes(query.tag)) &&
          (!query.q || row.description.includes(query.q))
      );
      return {
        items: matching
          .slice(query.offset, query.offset + query.limit)
          .map(withCredits),
        total: matching.length,
      };
    },

    async findById(id) {
      const series = rows.get(id);
      return series ? withCredits(series) : null;
    },

    async update(id, input) {
      const current = rows.get(id);
      if (!current) return null;
      const updated: PublicSeries = {
        ...current,
        title: input.title ?? current.title,
        description: input.description ?? current.description,
        tags: input.tags ?? current.tags,
        updatedAt: new Date(),
      };
      rows.set(id, updated);
      return withCredits(updated);
    },

    async remove(id, actor) {
      actors.push(['remove', actor]);
      credits.delete(id);
      return rows.delete(id);
    },

    async removeBook(seriesId, bookId) {
      if (!rows.has(seriesId)) return false;
      if (books.get(bookId) !== seriesId) {
        throw new NotFoundError('Book', bookId);
      }
      books.set(bookId, null);
      return true;
    },

    async addCoAuthor(seriesId, userId, actor) {
      actors.push(['addCoAuthor', actor]);
      const series = rows.get(seriesId);
      if (!series) return null;
      if (!accounts.has(userId)) throw new NotFoundError('User', userId);
      credits.set(seriesId, [...(credits.get(seriesId) ?? []), userId]);
      return withCredits(series);
    },

    async removeCoAuthor(seriesId, userId, actor) {
      actors.push(['removeCoAuthor', actor]);
      const series = rows.get(seriesId);
      if (!series) return null;
      credits.set(
        seriesId,
        (credits.get(seriesId) ?? []).filter((id) => id !== userId)
      );
      return withCredits(series);
    },

    async findCoAuthorIds(id) {
      const ids = credits.get(id);
      return ids ? [...ids] : null;
    },
  };
}
