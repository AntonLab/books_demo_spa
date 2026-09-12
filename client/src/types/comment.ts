import type { AuthorSummary } from './user';

// How a comment became a tombstone: `deleted` by its owner (or with the
// owner's account), `removed` by a moderator. null while it is live.
export const TOMBSTONES = ['deleted', 'removed'] as const;
export type Tombstone = (typeof TOMBSTONES)[number];

export interface PublicComment {
  id: number;
  parentId: number | null;
  // null on a tombstone, like its text and author: a tombstone is anonymous.
  userId: number | null;
  bookId: number;
  // Empty on a tombstone: the server keeps the original on the row and
  // withholds it in the response, so the client never has it to leak.
  text: string;
  tombstone: Tombstone | null;
  createdAt: string;
  updatedAt: string;
}

// What GET /api/comments returns. The author is embedded because /api/users is
// guarded, so the client cannot look one up.
export interface CommentWithAuthor extends PublicComment {
  // null on a tombstone of either kind, which is what makes it anonymous.
  author: AuthorSummary | null;
  likeCount: number;
  viewerLikeId: number | null;
}
