import type { AuthorSummary } from './user.ts';

// No userId: a series has no single owner (ADR-0005).
export interface PublicSeries {
  id: number;
  // Every Co-author, in the order they were credited, as on a book.
  authors: AuthorSummary[];
  title: string;
  description: string;
  tags: string[];
  createdAt: Date;
  updatedAt: Date;
}
