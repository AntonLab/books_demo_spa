import type { ListBooksParams } from '../api/books';
import type { ListSeriesParams } from '../api/series';

// One place where every cache key is spelled, so no two call sites can
// disagree about what identifies a query.
//
// `books` taking the same params object `listBooks` does is what keeps
// MainPage's key (`{ limit }`) and SearchPage's (`{ q, limit }`) distinct.
// searchSlice existed as a separate slice precisely so a search could not
// overwrite the MainPage list and leave stale results behind; two cache keys
// give that structurally, since neither can write the other's entry.
export const queryKeys = {
  session: ['auth', 'me'] as const,
  books: (params: ListBooksParams) => ['books', params] as const,
  // Keyed by a bare id, so it cannot collide with `books`, which is always
  // keyed by a params object.
  book: (id: number) => ['books', id] as const,
  chapters: (bookId: number) => ['chapters', { bookId }] as const,
  chapter: (id: number) => ['chapters', id] as const,
  comments: (bookId: number) => ['comments', { bookId }] as const,
  series: (params: ListSeriesParams) => ['series', params] as const,
  // Keyed by a bare id, like `book`, so neither collides with `series`.
  seriesDetail: (id: number) => ['series', id] as const,
  seriesBooks: (id: number) => ['series', id, 'books'] as const,
  authors: (q: string) => ['authors', { q }] as const,
};
