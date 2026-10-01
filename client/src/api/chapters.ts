import { request } from './client';
import type {
  CreateChapterPayload,
  ListResponse,
  UpdateChapterPayload,
} from 'shared';
import type { ChapterSummary, PublicChapter } from '../types/chapter';

// The server caps limit at 100. A book with more chapters than that would need
// paging; the reader's previous/next navigation reads this same list, so the
// cap bounds both.
const CHAPTERS_PAGE_SIZE = 100;

export const listChapters = (
  bookId: number
): Promise<ListResponse<ChapterSummary>> => {
  return request<ListResponse<ChapterSummary>>(
    `/chapters?bookId=${bookId}&limit=${CHAPTERS_PAGE_SIZE}`
  );
};

export const getChapter = (id: number): Promise<PublicChapter> => {
  return request<PublicChapter>(`/chapters/${id}`);
};

export const createChapter = (
  payload: CreateChapterPayload
): Promise<PublicChapter> => {
  return request<PublicChapter>('/chapters', { method: 'POST', body: payload });
};

export const updateChapter = (
  id: number,
  payload: UpdateChapterPayload
): Promise<PublicChapter> => {
  return request<PublicChapter>(`/chapters/${id}`, {
    method: 'PATCH',
    body: payload,
  });
};

export const deleteChapter = (id: number): Promise<void> => {
  return request<void>(`/chapters/${id}`, { method: 'DELETE' });
};

// The book's whole Reading order, first chapter first. The server answers 409
// when the ids are not exactly the book's chapters — one was added or deleted
// since the list was loaded.
export const reorderChapters = (
  bookId: number,
  chapterIds: number[]
): Promise<void> => {
  return request<void>(`/books/${bookId}/chapter-order`, {
    method: 'PUT',
    body: { chapterIds },
  });
};
