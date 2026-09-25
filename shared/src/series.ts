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
