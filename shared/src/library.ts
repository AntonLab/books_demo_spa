import type { PublicBook } from './book.ts';

// The Reading status (CONTEXT.md): where a Book sits in a reader's Library.
export const READING_STATUSES = [
  'reading',
  'plan_to_read',
  'read',
  'not_interested',
] as const;
export type ReadingStatus = (typeof READING_STATUSES)[number];

// What PUT /api/library/:bookId returns: one Library entry (CONTEXT.md).
export interface PublicLibraryEntry {
  bookId: number;
  status: ReadingStatus;
  updatedAt: Date;
}

// What POST /api/library/:bookId/add and /not-interested return: `status` is
// null once the entry is gone.
export interface BookLibraryState {
  bookId: number;
  status: ReadingStatus | null;
}

// What POST /api/library/series/:seriesId/add and /not-interested, and DELETE
// /api/library/series/:seriesId, return, and what a Series detail carries as
// `viewerLibrary`. `inLibrary`: some Published Book of the Series has a status
// other than not_interested. `notInterested`: the Series has a Published Book
// and every one is not_interested.
export interface SeriesLibraryState {
  inLibrary: boolean;
  notInterested: boolean;
}

// One item of GET /api/library: a Book in the reader's Library (CONTEXT.md)
// with its Reading status.
export type LibraryBook = PublicBook & { readingStatus: ReadingStatus };

// The Library tab counts (CONTEXT.md); `inLibraries` is how many readers hold
// the Book in a Library.
export interface LibraryCounts {
  reading: number;
  planToRead: number;
  read: number;
  inLibraries: number;
}

// A Library with no entries (CONTEXT.md), for fakes and client fixtures.
export const EMPTY_LIBRARY_COUNTS: LibraryCounts = {
  reading: 0,
  planToRead: 0,
  read: 0,
  inLibraries: 0,
};

// The body of PUT /api/library/:bookId: the Reading status to set.
export interface SetReadingStatusPayload {
  status: ReadingStatus;
}
