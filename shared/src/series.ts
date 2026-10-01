import type { PublicGenre } from './genre.ts';
import type { AuthorSummary } from './user.ts';

// No userId: a series has no single owner (ADR-0005).
export interface PublicSeries {
  id: number;
  // Every Co-author, in the order they were credited, as on a book.
  authors: AuthorSummary[];
  title: string;
  description: string;
  tags: string[];
  // The Series' own Genre, or null. Set independently of its Books' — a
  // Book never takes its Genre from its Series (CONTEXT.md, ADR-0008).
  genre: PublicGenre | null;
  createdAt: Date;
  updatedAt: Date;
}

// What GET /api/series/:id returns: the record plus the Favorite state the
// series page renders. Additive over PublicSeries, so the endpoint's existing
// readers are unaffected.
export interface SeriesDetail extends PublicSeries {
  // Accounts holding this series as a Favorite. A Series has no status, so
  // every one counts.
  favoriteCount: number;
  // The id of the viewer's own Favorite, for DELETE /api/favorites/:id; null
  // for a Guest and for an account without one.
  viewerFavoriteId: number | null;
}

// The body of POST /api/series; PATCH takes a Partial of it. No userId, as on
// a book.
export interface SeriesPayload {
  title: string;
  description: string;
  tags: string[];
  // Optional for the same reason as on a book: absent means `null` on create
  // and "leave it alone" on PATCH.
  genreId?: number | null;
}
