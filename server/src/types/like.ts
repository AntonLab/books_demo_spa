import { z } from 'zod';
import { idSchema } from './params.ts';

// Nullable *and* defaulted to null, so an omitted key and an explicit null
// reach the refine below as the same value — otherwise the XOR check would
// have to distinguish two spellings of "absent". ZodNullable and ZodDefault
// both short-circuit before the coercion runs, so neither null nor undefined
// is coerced to 0 or NaN on the way through.
const targetIdSchema = idSchema.nullable().default(null);

// Exactly one target, never both and never neither. Enforced again as a
// model-level validate in models/Like.ts, because a caller reaching Sequelize
// directly never passes through this schema; see .claude/rules/server/sequelize.md
// for why there is no CHECK constraint behind either of them.
function exactlyOneTarget(value: {
  bookId: number | null;
  commentId: number | null;
}): boolean {
  return (value.bookId === null) !== (value.commentId === null);
}

// No userId. The liker comes from req.user.id, never from the body —
// otherwise the self-like ban is defeated by naming someone else, and the
// unique indexes would be enforcing "one like per *claimed* user".
export const createLikeSchema = z
  .object({
    bookId: targetIdSchema,
    commentId: targetIdSchema,
    // Required rather than defaulted to true: a like and a dislike are the
    // same row with one bit flipped, and guessing which one the caller meant
    // is not the schema's business.
    isLike: z.boolean(),
  })
  .refine(exactlyOneTarget, {
    message: 'Exactly one of bookId or commentId must be set',
    path: ['bookId'],
  });

// Spelled out rather than derived from createLikeSchema, for the reason
// recorded in types/book.ts: `.partial()` does not undo a `.default()`, and
// here it would also drop the XOR refine that makes the create schema safe.
//
// isLike is the only editable field and it is required, which is what rejects
// an empty body — so this needs none of the `.partial().refine(...)` dance
// updateChapterSchema does. The targets are absent by construction: moving a
// like to another book is a re-parenting operation, not a field edit, and
// changing one would have to be checked against the unique indexes anyway.
export const updateLikeSchema = z.object({
  isLike: z.boolean(),
});

export const listLikesQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
  userId: idSchema.optional(),
  bookId: idSchema.optional(),
  commentId: idSchema.optional(),
  // stringbool, not z.coerce.boolean(): coercion runs Boolean("false"), which
  // is true, so ?isLike=false would silently return likes. There is no `?q=`
  // alongside these — a like has no text to search.
  isLike: z.stringbool().optional(),
});

export type CreateLikeInput = z.infer<typeof createLikeSchema>;
export type UpdateLikeInput = z.infer<typeof updateLikeSchema>;
export type ListLikesQuery = z.infer<typeof listLikesQuerySchema>;
