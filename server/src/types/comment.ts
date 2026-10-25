import { z } from 'zod';
import { limitOffsetShape } from './pagination.ts';
import { idSchema } from './params.ts';
import { COMMENT_TEXT_MAX_LENGTH } from 'shared';

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
  ...limitOffsetShape,
  bookId: idSchema.optional(),
  userId: idSchema.optional(),
  // The filter a thread view repeats, and the one comments_parent_id_id exists
  // to serve. There is no `?q=` alongside these: a comments section is read in
  // full, not searched.
  parentId: idSchema.optional(),
});

export type CreateCommentInput = z.infer<typeof createCommentSchema>;
export type UpdateCommentInput = z.infer<typeof updateCommentSchema>;
export type ListCommentsQuery = z.infer<typeof listCommentsQuerySchema>;
