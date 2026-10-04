import type { ListBooksParams } from '../api/books';
import type { ListLibraryParams } from '../api/library';
import type { ListReadingListsParams, WorkTarget } from '../api/readingLists';
import type { ListReportsParams, ReportRange } from '../api/reports';
import type { ListSeriesParams } from '../api/series';

// One place where every cache key is spelled, so no two call sites can
// disagree about what identifies a query.
//
// `books` takes the same params object `listBooks` does, so MainPage's key
// (`{ sort, pageSize }`) and SearchPage's (`{ q, pageSize }`) stay distinct and
// neither can overwrite the other's entry.
export const queryKeys = {
  session: ['auth', 'me'] as const,
  // A constant key, like `session`: the list takes no parameters at all.
  genres: ['genres'] as const,
  // Under the `genres` prefix, so a Genre write invalidates it too.
  genresWithBooks: ['genres', { nonEmpty: true }] as const,
  // The admin-only list with counts; under `genres` too, so a write refreshes it.
  genresCounts: ['genres', { counts: true }] as const,
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
  // The `['accounts']` prefix is what an Account edit invalidates.
  accountProfile: (id: number) => ['accounts', id] as const,
  authors: (q: string) => ['authors', { q }] as const,
  notifications: (userId: number) => ['notifications', userId] as const,
  // The prefix over every Account's notifications.
  allNotifications: ['notifications'] as const,
  // The prefixes a write that touches a work, a comment or an Account
  // invalidates.
  allBooks: ['books'] as const,
  allSeries: ['series'] as const,
  allChapters: ['chapters'] as const,
  allComments: ['comments'] as const,
  allAuthors: ['authors'] as const,
  allAccounts: ['accounts'] as const,
  // The prefix a Favorite toggle or removal invalidates.
  allFavorites: ['favorites'] as const,
  library: (params: ListLibraryParams) => ['library', params] as const,
  // The prefix a Reading status change invalidates.
  allLibrary: ['library'] as const,
  reports: (params: ListReportsParams) => ['reports', params] as const,
  reportStatistics: (range: ReportRange) =>
    ['reports', 'statistics', range] as const,
  // The prefix over the list and the statistics, so one invalidation refreshes
  // both.
  allReports: ['reports'] as const,
  // Keyed by a bare id, like `book`, so neither collides with a page of lists
  // (by Account or by Book), which is keyed by its params object.
  readingList: (id: number) => ['readingLists', id] as const,
  readingListItems: (id: number) => ['readingLists', id, 'items'] as const,
  readingListsPage: (params: ListReadingListsParams) =>
    ['readingLists', params] as const,
  // The Lists of the session's Account that hold (or could take) a work.
  myListsForWork: (target: WorkTarget) => ['myReadingLists', target] as const,
  // The prefixes a Reading list write invalidates.
  allReadingLists: ['readingLists'] as const,
  allMyReadingLists: ['myReadingLists'] as const,
  // Not keyed by Account, unlike notifications: the answer is always the
  // session's, so watchSession's refetch on an Account change is correct.
  notificationSettings: ['notificationSettings'] as const,
};
