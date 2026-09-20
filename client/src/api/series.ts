import { request } from './client';
import type { ListResponse } from '../types/api';
import type { PublicSeries, SeriesBookSummary } from '../types/series';

export interface ListSeriesParams {
  userId?: number;
  // One Genre's series, as on the book list.
  genreId?: number;
  limit?: number;
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

  const query = search.toString();
  return request<ListResponse<PublicSeries>>(
    query ? `/series?${query}` : '/series'
  );
};

export const getSeries = (id: number): Promise<PublicSeries> => {
  return request<PublicSeries>(`/series/${id}`);
};

export interface SeriesPayload {
  title: string;
  description: string;
  tags: string[];
  // Optional for the same reason as on a book: absent means `null` on create
  // and "leave it alone" on PATCH.
  genreId?: number | null;
}

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
): Promise<{ items: SeriesBookSummary[] }> => {
  return request<{ items: SeriesBookSummary[] }>(`/series/${seriesId}/books`);
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
