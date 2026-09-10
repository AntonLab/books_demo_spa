import type { AuthorSummary } from './user';

export interface PublicComment {
  id: number;
  parentId: number | null;
  userId: number;
  bookId: number;
  text: string;
  createdAt: string;
  updatedAt: string;
}

// What GET /api/comments returns. The author is embedded because /api/users is
// guarded, so the client cannot look one up.
export interface CommentWithAuthor extends PublicComment {
  author: AuthorSummary;
  likeCount: number;
  viewerLikeId: number | null;
}
