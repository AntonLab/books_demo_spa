import type { AuthorSummary } from './user.ts';

// The two ways a comment becomes a tombstone. `deleted`: its owner deleted it,
// or the owner's account was deleted. `removed`: a moderator deleted someone
// else's comment — the only kind that can be restored. See CONTEXT.md.
export const TOMBSTONES = ['deleted', 'removed'] as const;
export type Tombstone = (typeof TOMBSTONES)[number];

// The full record. `parentId` is null for a top-level comment.
export interface PublicComment {
  id: number;
  parentId: number | null;
  // null on a tombstone, like its text: naming the owner would undo the
  // anonymity the rest of the tombstone gives.
  userId: number | null;
  bookId: number;
  // Empty string on a tombstone — the row keeps the original, the serialiser
  // withholds it. See toPublicComment in server/src/models/Comment.ts.
  text: string;
  tombstone: Tombstone | null;
  createdAt: Date;
  updatedAt: Date;
}

// What the list endpoint returns. The author is embedded because a comment
// without a name is unreadable and the client cannot look one up: /api/users is
// guarded. The like fields ride along for the reason the book detail carries
// them — the alternative is one request per comment on screen.
export interface CommentWithAuthor extends PublicComment {
  // null on a tombstone of either kind — a tombstone is anonymous, and one
  // whose owner's account was deleted has no author to name at all. A live
  // comment always has one.
  author: AuthorSummary | null;
  likeCount: number;
  viewerLikeId: number | null;
}
