import type { AuthorSummary } from './user';

// No userId: a book has no single owner (ADR-0005).
export interface PublicBook {
  id: number;
  // Every Co-author, in the order they were credited. Embedded in the list as
  // well as the detail, so a card can name them without another request.
  authors: AuthorSummary[];
  seriesId: number | null;
  title: string;
  description: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

// What GET /api/books/:id returns: the record plus the series name the book
// page shows and the like state it renders. Additive over PublicBook, so the
// list endpoint's readers are unaffected.
export interface BookDetail extends PublicBook {
  series: { id: number; title: string } | null;
  likeCount: number;
  // null both for an anonymous visitor and for a signed-in one who has not
  // liked this book. No third state is needed: with no session the button is
  // hidden outright.
  viewerLikeId: number | null;
}
