import { request, toQueryString } from './client';
import type {
  PagedResponse,
  ReadingStatus,
  SetReadingStatusPayload,
} from 'shared';
import type {
  BookLibraryState,
  LibraryBook,
  PublicLibraryEntry,
} from '../types/library';

export interface ListLibraryParams {
  status?: ReadingStatus;
  // antd Pagination's names: the 1-based page and its size.
  current?: number;
  pageSize?: number;
}

// 404 when the viewer cannot see the book.
export const setReadingStatus = (
  bookId: number,
  status: ReadingStatus
): Promise<PublicLibraryEntry> => {
  const payload: SetReadingStatusPayload = { status };
  return request<PublicLibraryEntry>(`/library/${bookId}`, {
    method: 'PUT',
    body: payload,
  });
};

// Plan to read, unless the Book already has a status; 404 when the viewer
// cannot see the book.
export const addBookToLibrary = (bookId: number): Promise<BookLibraryState> => {
  return request<BookLibraryState>(`/library/${bookId}/add`, {
    method: 'POST',
  });
};

// A toggle; the server answers 409 from reading or read.
export const toggleBookNotInterested = (
  bookId: number
): Promise<BookLibraryState> => {
  return request<BookLibraryState>(`/library/${bookId}/not-interested`, {
    method: 'POST',
  });
};

// Takes the book's id, not an entry's. The server answers 204, which
// request() maps to undefined.
export const clearReadingStatus = (bookId: number): Promise<void> => {
  return request<void>(`/library/${bookId}`, { method: 'DELETE' });
};

// Undefined, null and empty-string params are left out, as listBooks does.
export const listLibrary = (
  params: ListLibraryParams = {}
): Promise<PagedResponse<LibraryBook>> => {
  return request<PagedResponse<LibraryBook>>(
    `/library${toQueryString(params)}`
  );
};
