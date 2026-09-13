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
