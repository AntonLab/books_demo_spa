import type { PublicBook } from './book.ts';
import type { PublicSeries } from './series.ts';

// What POST /api/favorites returns. Exactly one of bookId / seriesId is set.
export interface PublicFavorite {
  id: number;
  userId: number;
  bookId: number | null;
  seriesId: number | null;
  createdAt: Date;
}

// One row of GET /api/favorites/books. `id` is the Favorite's own id, the one
// DELETE /api/favorites/:id takes; the Book rides along so the page needs no
// second request per row.
export interface FavoriteBook {
  id: number;
  createdAt: Date;
  book: PublicBook;
}

// One row of GET /api/favorites/series, on the same terms as FavoriteBook.
export interface FavoriteSeries {
  id: number;
  createdAt: Date;
  series: PublicSeries;
}
