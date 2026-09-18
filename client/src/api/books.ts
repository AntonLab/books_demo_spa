import { request } from './client';
import type { ListResponse } from '../types/api';
import type { BookDetail, BookStatus, PublicBook } from '../types/book';

export interface ListBooksParams {
  q?: string;
  // Naming the caller's own id is the one list that includes their drafts.
  userId?: number;
  limit?: number;
  offset?: number;
}

export interface CreateBookPayload {
  title: string;
  description: string;
  tags: string[];
  seriesId: number | null;
}

// Every field optional, as the server's PATCH schema is. `status` is here and
// not on create: a new book is always a draft.
export type UpdateBookPayload = Partial<CreateBookPayload> & {
  status?: BookStatus;
};

// One function, two callers: `useBooks` fetches the unfiltered first page and
// `useSearchBooks` passes a `q`. The server's schema rejects an empty `q`
// (`z.string().min(1)`), so a blank term is omitted rather than sent —
// `useSearchBooks` also disables itself on one, which stops the request
// happening at all rather than merely shaping the URL.
export const listBooks = (
  params: ListBooksParams = {}
): Promise<ListResponse<PublicBook>> => {
  const search = new URLSearchParams();
  if (params.q) search.set('q', params.q);
  if (params.userId !== undefined) search.set('userId', String(params.userId));
  if (params.limit !== undefined) search.set('limit', String(params.limit));
  if (params.offset !== undefined) search.set('offset', String(params.offset));

  const query = search.toString();
  return request<ListResponse<PublicBook>>(
    query ? `/books?${query}` : '/books'
  );
};

// Returns BookDetail, not PublicBook: the detail endpoint adds
// the series name and the like state, neither of which the list carries.
export const getBook = (id: number): Promise<BookDetail> => {
  return request<BookDetail>(`/books/${id}`);
};

export const createBook = (payload: CreateBookPayload): Promise<PublicBook> => {
  return request<PublicBook>('/books', { method: 'POST', body: payload });
};

export const updateBook = (
  id: number,
  payload: UpdateBookPayload
): Promise<PublicBook> => {
  return request<PublicBook>(`/books/${id}`, {
    method: 'PATCH',
    body: payload,
  });
};

export const deleteBook = (id: number): Promise<void> => {
  return request<void>(`/books/${id}`, { method: 'DELETE' });
};

export const addCoAuthor = (
  bookId: number,
  userId: number
): Promise<PublicBook> => {
  return request<PublicBook>(`/books/${bookId}/co-authors`, {
    method: 'POST',
    body: { userId },
  });
};

// Removing someone else and leaving are the same call: the id says whose
// credit goes.
export const removeCoAuthor = (
  bookId: number,
  userId: number
): Promise<PublicBook> => {
  return request<PublicBook>(`/books/${bookId}/co-authors/${userId}`, {
    method: 'DELETE',
  });
};

// K2: the body is a Blob (a File), so request() sends it as-is (K1).
export const uploadBookCover = (
  id: number,
  file: File
): Promise<PublicBook> => {
  return request<PublicBook>(`/books/${id}/cover`, {
    method: 'PUT',
    body: file,
  });
};

export const deleteBookCover = (id: number): Promise<void> => {
  return request<void>(`/books/${id}/cover`, { method: 'DELETE' });
};
