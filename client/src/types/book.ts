import type { AuthorSummary } from './user';

export interface PublicBook {
  id: number;
  userId: number;
  seriesId: number | null;
  title: string;
  description: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

// What GET /api/books/:id returns: the record plus the two names the book page
// shows and the like state it renders. Additive over PublicBook, so the list
// endpoint's readers are unaffected.
export interface BookDetail extends PublicBook {
  author: AuthorSummary;
  series: { id: number; title: string } | null;
  likeCount: number;
  // null both for an anonymous visitor and for a signed-in one who has not
  // liked this book. No third state is needed: with no session the button is
  // hidden outright.
  viewerLikeId: number | null;
}
