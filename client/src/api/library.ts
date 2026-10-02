import { request } from './client';
import type {
  PagedResponse,
  ReadingStatus,
  SetReadingStatusPayload,
} from 'shared';
import type { LibraryBook, PublicLibraryEntry } from '../types/library';

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

// Takes the book's id, not an entry's. The server answers 204, which
// request() maps to undefined.
export const clearReadingStatus = (bookId: number): Promise<void> => {
  return request<void>(`/library/${bookId}`, { method: 'DELETE' });
};

// An undefined param is left out, as listBooks does.
export const listLibrary = (
  params: ListLibraryParams = {}
): Promise<PagedResponse<LibraryBook>> => {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params) as [
    string,
    string | number | undefined,
  ][]) {
    if (value !== undefined) search.set(key, String(value));
  }

  const query = search.toString();
  return request<PagedResponse<LibraryBook>>(
    query ? `/library?${query}` : '/library'
  );
};
