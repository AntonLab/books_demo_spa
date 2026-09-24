import type { PublicGenre } from './genre.ts';
import type { AuthorSummary } from './user.ts';

// The Book status (CONTEXT.md): only `draft` keeps a book from readers;
// `complete` is a label and restricts nothing.
export const BOOK_STATUSES = ['draft', 'in_progress', 'complete'] as const;
export type BookStatus = (typeof BOOK_STATUSES)[number];

// What `GET /api/books?sort=` ranks by (CONTEXT.md): Popularity, Release time,
// Last update — each best first.
export const BOOK_SORTS = ['popular', 'new', 'updated'] as const;
export type BookSort = (typeof BOOK_SORTS)[number];

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
  // A7: the Book's Genre, embedded so a card can show it without a second
  // request, or null. A Book takes it from nowhere else — never from its
  // Series (CONTEXT.md, ADR-0008). `SeriesBookSummary` picks four fields and
  // is deliberately not one of them.
  genre: PublicGenre | null;
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

// The Book statuses a search may ask for: a Draft book never appears in one.
export const SEARCHABLE_BOOK_STATUSES = ['in_progress', 'complete'] as const;
export type SearchableBookStatus = (typeof SEARCHABLE_BOOK_STATUSES)[number];

// The longest text a search field takes (title/description, author, series
// title), counted after trimming. Client and server both check it.
export const SEARCH_TEXT_MAX_LENGTH = 200;
