import { request } from './client';
import type { PagedResponse } from 'shared';
import type {
  BookDetail,
  BookSort,
  BookStatus,
  PublicBook,
  SearchableBookStatus,
} from '../types/book';

export interface ListBooksParams {
  // Title or description.
  q?: string;
  // Naming the caller's own id is the one list that includes their drafts.
  userId?: number;
  // The series' books in its Series order, rather than the default by id.
  seriesId?: number;
  genreId?: number;
  status?: SearchableBookStatus;
  // ISO instants, both bounds inclusive: the Release time and Last update
  // ranges (CONTEXT.md).
  releasedFrom?: string;
  releasedTo?: string;
  updatedFrom?: string;
  updatedTo?: string;
  // Login, first or last name of any Co-author.
  author?: string;
  seriesTitle?: string;
  // Best first by Popularity, Release time or Last update, rather than by id.
  sort?: BookSort;
  // antd Pagination's names: the 1-based page and its size.
  current?: number;
  pageSize?: number;
}

export interface CreateBookPayload {
  title: string;
  description: string;
  tags: string[];
  seriesId: number | null;
  // Optional, because the wire contract is: absent means `null` on create and
  // "leave the Genre as it is" on PATCH. JSON.stringify drops an undefined key,
  // so omitting it here is what sends nothing.
  genreId?: number | null;
}

// Every field optional, as the server's PATCH schema is. `status` is here and
// not on create: a new book is always a draft.
export type UpdateBookPayload = Partial<CreateBookPayload> & {
  status?: BookStatus;
};

// Every filter combines with the others by AND. Written in the order the
// caller gave them; an undefined or empty value is left out, since the server
// refuses a blank text filter.
export const listBooks = (
  params: ListBooksParams = {}
): Promise<PagedResponse<PublicBook>> => {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params) as [
    string,
    string | number | undefined,
  ][]) {
    if (value !== undefined && value !== '') search.set(key, String(value));
  }

  const query = search.toString();
  return request<PagedResponse<PublicBook>>(
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
