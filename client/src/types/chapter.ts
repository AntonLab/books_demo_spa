import type * as Shared from 'shared';
import type { Wire } from 'shared';

// Dates cross the wire as ISO strings; the server types them as Date in
// process, and Wire<> makes that translation. `publishedAt` is the Publication
// time: null for a Draft chapter, a future moment for a Scheduled one, a past
// one once it is Published. See CONTEXT.md.
export type PublicChapter = Wire<Shared.PublicChapter>;

// What the list endpoint returns: the same record minus the body, so a page of
// chapters cannot drag a MEDIUMTEXT column per row across the wire.
export type ChapterSummary = Wire<Shared.ChapterSummary>;

type ChapterState = 'draft' | 'scheduled' | 'published';

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
