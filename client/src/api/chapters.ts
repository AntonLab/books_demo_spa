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
