// The full record, returned by GET /api/chapters/:id.
export interface PublicChapter {
  id: number;
  bookId: number;
  title: string;
  text: string;
  // The Publication time: null for a Draft chapter, a future moment for a
  // Scheduled one, a past one once it is Published. See CONTEXT.md.
  publishedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

// What the list endpoint returns: the same record minus the body. Keeping the
// omission in the type (rather than trusting each call site to strip it) is
// what stops a MEDIUMTEXT column from being paged out twenty rows at a time.
export type ChapterSummary = Omit<PublicChapter, 'text'>;

// Counted after trimming, as every title is.
export const CHAPTER_TITLE_MAX_LENGTH = 255;

// How a save sets the Publication time: 'now' publishes at the server's clock,
// an ISO instant schedules, and null keeps the chapter a draft.
export type PublishedAtPayload = 'now' | string | null;

// The body of POST /api/chapters.
export interface CreateChapterPayload {
  bookId: number;
  title: string;
  text: string;
  publishedAt: PublishedAtPayload;
}

// The body of PATCH /api/chapters/:id. `expectedUpdatedAt` is the version
// this save was based on; the server answers 409 if the chapter changed since.
// `publishedAt` is left out to keep the Publication time as it is — the only
// way to edit a Published chapter.
export interface UpdateChapterPayload {
  title?: string;
  text?: string;
  publishedAt?: PublishedAtPayload;
  expectedUpdatedAt: string;
}
