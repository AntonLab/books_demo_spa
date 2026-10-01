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
  // The Book's Genre, embedded so a card can show it without a second
  // request, or null. A Book takes it from nowhere else — never from its
  // Series (CONTEXT.md, ADR-0008). `SeriesBookSummary` picks four fields and
  // is deliberately not one of them.
  genre: PublicGenre | null;
  // The URL the browser fetches, versioned by the Cover's own
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
  // Live Comments on the book, roots and replies; a Tombstone never counts.
  commentCount: number;
  // The words in the book's Published chapters. The same for every viewer: a
  // Co-author's Draft and Scheduled chapters never count, so the figure is the
  // one readers see.
  wordCount: number;
  // Accounts holding this book as a Favorite. 0 while the book is a Draft,
  // whoever reads it: a Draft book's Favorites are kept but not counted.
  favoriteCount: number;
  // The id of the viewer's own Favorite, for DELETE /api/favorites/:id; null
  // for a Guest and for an account without one. Reported on a Draft too, so
  // the button a Co-author sees matches the row that exists.
  viewerFavoriteId: number | null;
}

// The Book statuses a search may ask for: a Draft book never appears in one.
export const SEARCHABLE_BOOK_STATUSES = ['in_progress', 'complete'] as const;
export type SearchableBookStatus = (typeof SEARCHABLE_BOOK_STATUSES)[number];

// The longest text a search field takes (title/description, author, series
// title), counted after trimming. Client and server both check it.
export const SEARCH_TEXT_MAX_LENGTH = 200;

// The message for a range whose start comes after its end (a "from" day
// after its "to"): the server's zod refinement and the client's form rule
// both say this, so the error reads the same whichever one catches it.
export const RANGE_ORDER = 'Must not be after the end date.';

// The body of POST /api/books. No userId: the first Co-author is whoever is
// signed in. Stricter than the server, which defaults `seriesId` and `tags`;
// the form always sends both.
export interface CreateBookPayload {
  title: string;
  description: string;
  tags: string[];
  seriesId: number | null;
  // Optional, because the wire contract is: absent means `null` on create and
  // "leave the Genre as it is" on PATCH. JSON.stringify drops an undefined key,
  // so omitting it here is what sends nothing.
  genreId?: number | null;
}

// The body of PATCH /api/books/:id. Every field optional, as the server's
// schema is. `status` is here and not on create: a new book is always a draft.
export type UpdateBookPayload = Partial<CreateBookPayload> & {
  status?: BookStatus;
};
