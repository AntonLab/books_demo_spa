import { request } from './client';
import type { ListResponse } from '../types/api';
import type { ChapterSummary, PublicChapter } from '../types/chapter';

// The server caps limit at 100. A book with more chapters than that would need
// paging; the reader's previous/next navigation reads this same list, so the
// cap bounds both.
export const CHAPTERS_PAGE_SIZE = 100;

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

// How a save sets the Publication time: 'now' publishes at the server's clock,
// an ISO instant schedules, and null keeps the chapter a draft.
export type PublishedAtPayload = 'now' | string | null;

export interface CreateChapterPayload {
  bookId: number;
  title: string;
  text: string;
  publishedAt: PublishedAtPayload;
}

// `expectedUpdatedAt` is the version this save was based on; the server
// answers 409 if the chapter changed since. `publishedAt` is left out to keep
// the Publication time as it is — the only way to edit a Published chapter.
export interface UpdateChapterPayload {
  title?: string;
  text?: string;
  publishedAt?: PublishedAtPayload;
  expectedUpdatedAt: string;
}

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
