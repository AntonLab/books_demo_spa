// Dates cross the wire as ISO strings; the server types them as Date in
// process. See client/CLAUDE.md.
export interface PublicChapter {
  id: number;
  bookId: number;
  title: string;
  text: string;
  // The Publication time: null for a Draft chapter, a future moment for a
  // Scheduled one, a past one once it is Published. See CONTEXT.md.
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

// What the list endpoint returns: the same record minus the body, so a page of
// chapters cannot drag a MEDIUMTEXT column per row across the wire.
export type ChapterSummary = Omit<PublicChapter, 'text'>;

export type ChapterState = 'draft' | 'scheduled' | 'published';

// A chapter's state at a given moment. Nothing on the server flips a flag when
// a scheduled time passes — every read compares it with the clock — so the
// client does the same.
export const chapterStateOf = (
  chapter: Pick<ChapterSummary, 'publishedAt'>,
  now: number = Date.now()
): ChapterState => {
  if (chapter.publishedAt === null) return 'draft';
  return new Date(chapter.publishedAt).getTime() <= now
    ? 'published'
    : 'scheduled';
};

// The chapters a reader sees. The server already leaves out the rest for a
// reader; a book's Co-authors get every chapter back, and the public pages
// filter them here so a Co-author reads the book as its readers do.
export const publishedChapters = <
  T extends Pick<ChapterSummary, 'publishedAt'>,
>(
  chapters: readonly T[],
  now: number = Date.now()
): T[] =>
  chapters.filter((chapter) => chapterStateOf(chapter, now) === 'published');
