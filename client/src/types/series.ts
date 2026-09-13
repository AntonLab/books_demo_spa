import type { BookStatus } from './book';
import type { AuthorSummary } from './user';

// A mirror of the server's PublicSeries. Like a book, a series has no userId:
// its Co-authors come embedded, in credit order.
export interface PublicSeries {
  id: number;
  authors: AuthorSummary[];
  title: string;
  description: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

// One book of the series editor's list. A summary, because the list reaches a
// series' Co-authors who may not co-author a Draft book filed in it: what the
// book is called and where it stands, never what it says.
export interface SeriesBookSummary {
  id: number;
  title: string;
  status: BookStatus;
  authors: AuthorSummary[];
}
