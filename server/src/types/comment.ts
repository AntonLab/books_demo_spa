import { z } from 'zod';
import type { AuthorSummary } from './user.ts';

// `text` is a TEXT column, which holds 65,535 *bytes* — as few as ~16k
// characters under utf8mb4 — so the bound sits well inside it rather than at
// it, or MySQL truncates (or, in strict mode, rejects) the write. Chapters take
// the same care at a far larger bound; see CHAPTER_TEXT_MAX_LENGTH in
// types/chapter.ts.
export const COMMENT_TEXT_MAX_LENGTH = 10_000;

const idSchema = z.coerce.number().int().positive();

// Deliberately untrimmed, like a chapter body and unlike a title: paragraph
// breaks and indentation are part of what someone wrote, not an input artefact.
// min(1) still rejects an empty string.
const textSchema = z.string().min(1).max(COMMENT_TEXT_MAX_LENGTH);

// No userId. The author comes from req.user.id, never from the body —
// otherwise "you may only edit your own comment" means nothing, since anyone
// could post under another user's name and then be locked out of their own row.
export const createCommentSchema = z.object({
  bookId: idSchema,
  // Nullable *and* defaulted to null, following types/like.ts: an omitted key
  // and an explicit null reach the rest of the app as the same value, so the
  // column has one empty value rather than two. A top-level comment replies to
  // nothing, which is what makes the thread a tree.
  parentId: idSchema.nullable().default(null),
  text: textSchema,
});

// Spelled out rather than derived from createCommentSchema, for the reason
// recorded in types/book.ts: `.partial()` does not undo a `.default()`, and a
// derived schema is one added default away from silently wiping a field.
//
// Only the text is editable. bookId and parentId are absent by construction —
// moving a comment to another book or under another parent is a re-parenting
// operation, not a field edit. `text` being required is what rejects an empty
// body, so this needs none of updateChapterSchema's `.partial().refine(...)`.
export const updateCommentSchema = z.object({
  text: textSchema,
});

export const listCommentsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
  bookId: idSchema.optional(),
  userId: idSchema.optional(),
  // The filter a thread view repeats, and the one comments_parent_id_id exists
  // to serve. There is no `?q=` alongside these: a comments section is read in
  // full, not searched.
  parentId: idSchema.optional(),
});

// A local copy rather than an import, following the same reasoning as
// types/book.ts: the resources share a shape today, not a reason to change
// together.
export const idParamSchema = z.object({
  id: z.coerce.number().int().positive(),
});

export type CreateCommentInput = z.infer<typeof createCommentSchema>;
export type UpdateCommentInput = z.infer<typeof updateCommentSchema>;
export type ListCommentsQuery = z.infer<typeof listCommentsQuerySchema>;

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
  // withholds it. See toPublicComment in models/Comment.ts.
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
