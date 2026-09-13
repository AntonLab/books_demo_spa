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
