import type { ListBooksParams } from '../api/books';

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
};
