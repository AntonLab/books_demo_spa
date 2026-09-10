import type { AuthorSummary } from './user';

export interface PublicComment {
  id: number;
  parentId: number | null;
  userId: number;
  bookId: number;
  // Empty once `isDeleted` is set: the server keeps the original on the row and
  // withholds it in the response, so the client never has it to leak.
  text: string;
  isDeleted: boolean;
  createdAt: string;
  updatedAt: string;
}

// What GET /api/comments returns. The author is embedded because /api/users is
// guarded, so the client cannot look one up.
export interface CommentWithAuthor extends PublicComment {
  // null on a deleted comment, which is what makes the tombstone anonymous.
  author: AuthorSummary | null;
  likeCount: number;
  viewerLikeId: number | null;
}
