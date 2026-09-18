import type { AuthorSummary } from './user.ts';

// The Book status (CONTEXT.md): only `draft` keeps a book from readers;
// `complete` is a label and restricts nothing.
export const BOOK_STATUSES = ['draft', 'in_progress', 'complete'] as const;
export type BookStatus = (typeof BOOK_STATUSES)[number];

// No userId: a book has no single owner (ADR-0005).
export interface PublicBook {
  id: number;
  // Every Co-author, in the order they were credited. Embedded in the list as
  // well as the detail, so a book card can name them without a second request
  // to /api/users, which is guarded.
  authors: AuthorSummary[];
  seriesId: number | null;
  title: string;
  description: string;
  tags: string[];
  status: BookStatus;
  // A7: the URL the browser fetches, versioned by the Cover's own
  // updatedAt so a replace is never served stale. null when there is none.
  coverUrl: string | null;
  createdAt: Date;
  updatedAt: Date;
}

// One row of GET /api/series/:id/books, the series editor's list. A summary
// rather than a PublicBook, because that list reaches a series' Co-authors who
// may not co-author a Draft book filed in it: they see what the book is called
// and where it stands, never its annotation or text.
export type SeriesBookSummary = Pick<
  PublicBook,
  'id' | 'title' | 'status' | 'authors'
>;

// What GET /api/books/:id returns: the record plus the series name a book page
// has to show and the like state it renders. Additive over PublicBook, so the
// endpoint's existing readers are unaffected. The Co-authors come with
// PublicBook itself.
export interface BookDetail extends PublicBook {
  series: { id: number; title: string } | null;
  likeCount: number;
  // null both for an anonymous visitor and for a signed-in one who has not
  // liked this book. The client needs no third state: with no session it hides
  // the button outright.
  viewerLikeId: number | null;
}
