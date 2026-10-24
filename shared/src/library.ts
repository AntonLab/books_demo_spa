import type { PublicBook } from './book.ts';

// The Reading status (CONTEXT.md): where a Book sits in a reader's Library.
export const READING_STATUSES = [
  'reading',
  'plan_to_read',
  'read',
  'not_interested',
] as const;
export type ReadingStatus = (typeof READING_STATUSES)[number];

// What a reader's client reports to POST /api/books/:id/reading-progress.
export const READING_PROGRESS_EVENTS = ['opened', 'finished'] as const;
export type ReadingProgressEvent = (typeof READING_PROGRESS_EVENTS)[number];

// The body of POST /api/books/:id/reading-progress: `chapterId` is the Chapter
// that was opened or finished.
export interface ReadingProgressPayload {
  event: ReadingProgressEvent;
  chapterId: number;
}

// What POST /api/library/:bookId/add and /not-interested return: `status` is
// null once the entry is gone.
export interface BookLibraryState {
  bookId: number;
  status: ReadingStatus | null;
}

// A Series' Library state for the viewer, returned by the Series Library
// actions and carried by a Series detail as `viewerLibrary`. `inLibrary`: a
// Published Book has a status other than not_interested. `notInterested`: the
// Series has Published Books and all are not_interested.
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
