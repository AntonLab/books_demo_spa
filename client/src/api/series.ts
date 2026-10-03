import { request } from './client';
import type {
  BookSort,
  ItemsResponse,
  ListResponse,
  SeriesPayload,
  WithFavoriteId,
} from 'shared';
import type {
  PublicSeries,
  SeriesBookSummary,
  SeriesDetail,
} from '../types/api';

export interface ListSeriesParams {
  userId?: number;
  // One Genre's series, as on the book list.
  genreId?: number;
  limit?: number;
  // Title or description; the server refuses a blank one.
  q?: string;
  tag?: string;
  offset?: number;
  // Only the caller's own Favorites; see listFavoritedSeries.
  favoritedBy?: 'me';
  sort?: BookSort;
  // Only Published series, so an Owner's Drafts stay off a public list.
  published?: 'true';
}

// `?userId=` naming the caller lists the series they co-author: the book form's
// series choices and the Series tab of My books.
export const listSeries = (
  params: ListSeriesParams = {}
): Promise<ListResponse<PublicSeries>> => {
  const search = new URLSearchParams();
  if (params.userId !== undefined) search.set('userId', String(params.userId));
  if (params.genreId !== undefined)
    search.set('genreId', String(params.genreId));
  if (params.limit !== undefined) search.set('limit', String(params.limit));
  if (params.q) search.set('q', params.q);
  if (params.tag) search.set('tag', params.tag);
  if (params.offset !== undefined) search.set('offset', String(params.offset));
  if (params.favoritedBy) search.set('favoritedBy', params.favoritedBy);
  if (params.sort) search.set('sort', params.sort);
  if (params.published) search.set('published', params.published);

  const query = search.toString();
  return request<ListResponse<PublicSeries>>(
    query ? `/series?${query}` : '/series'
  );
};

// The server adds `favoriteId` to each item exactly when `favoritedBy=me`, so
// the cast holds.
export const listFavoritedSeries = (
  params: ListSeriesParams = {}
): Promise<ListResponse<WithFavoriteId<PublicSeries>>> =>
  listSeries({ ...params, favoritedBy: 'me' }) as Promise<
    ListResponse<WithFavoriteId<PublicSeries>>
  >;

export const getSeries = (id: number): Promise<SeriesDetail> => {
  return request<SeriesDetail>(`/series/${id}`);
};

export const createSeries = (payload: SeriesPayload): Promise<PublicSeries> => {
  return request<PublicSeries>('/series', { method: 'POST', body: payload });
};

export const updateSeries = (
  id: number,
  payload: Partial<SeriesPayload>
): Promise<PublicSeries> => {
  return request<PublicSeries>(`/series/${id}`, {
    method: 'PATCH',
    body: payload,
  });
};

// The series' books are not deleted with it; they stay, outside any series.
export const deleteSeries = (id: number): Promise<void> => {
  return request<void>(`/series/${id}`, { method: 'DELETE' });
};

// The body is a Blob (a File), so request() sends it as-is.
export const uploadSeriesCover = (
  id: number,
  file: File
): Promise<PublicSeries> => {
  return request<PublicSeries>(`/series/${id}/cover`, {
    method: 'PUT',
    body: file,
  });
};

export const deleteSeriesCover = (id: number): Promise<void> => {
  return request<void>(`/series/${id}/cover`, { method: 'DELETE' });
};

export const addSeriesCoAuthor = (
  seriesId: number,
  userId: number
): Promise<PublicSeries> => {
  return request<PublicSeries>(`/series/${seriesId}/co-authors`, {
    method: 'POST',
    body: { userId },
  });
};

// Removing someone else and leaving are the same call, as on a book.
export const removeSeriesCoAuthor = (
  seriesId: number,
  userId: number
): Promise<PublicSeries> => {
  return request<PublicSeries>(`/series/${seriesId}/co-authors/${userId}`, {
    method: 'DELETE',
  });
};

// The series editor's list: every book filed in the series, drafts included,
// in Series order. Only its Co-authors and Moderators may read it.
export const listSeriesBooks = (
  seriesId: number
): Promise<ItemsResponse<SeriesBookSummary>> => {
  return request<ItemsResponse<SeriesBookSummary>>(`/series/${seriesId}/books`);
};

// The series' whole Series order, first book first. The server answers 409
// when the ids are not exactly the books in the series.
export const reorderSeriesBooks = (
  seriesId: number,
  bookIds: number[]
): Promise<void> => {
  return request<void>(`/series/${seriesId}/book-order`, {
    method: 'PUT',
    body: { bookIds },
  });
};

// Takes a book out of the series from the series' side; the book itself stays.
export const removeBookFromSeries = (
  seriesId: number,
  bookId: number
): Promise<void> => {
  return request<void>(`/series/${seriesId}/books/${bookId}`, {
    method: 'DELETE',
  });
};
