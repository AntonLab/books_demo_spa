import { z } from 'zod';
import { limitOffsetShape } from './pagination.ts';
import { idSchema } from './params.ts';

// Nullable and defaulted to null, as in types/like.ts: an omitted key and an
// explicit null reach the refine as the same value.
const targetIdSchema = idSchema.nullable().default(null);

// Enforced again by the model validate in models/Favorite.ts, because a
// caller reaching Sequelize directly never passes through zod, and Sequelize 6
// cannot declare the CHECK constraint.
function exactlyOneTarget(value: {
  bookId: number | null;
  seriesId: number | null;
}): boolean {
  return (value.bookId === null) !== (value.seriesId === null);
}

// No userId: the holder comes from the session, or the unique indexes would
// enforce "one favorite per *claimed* account".
export const createFavoriteSchema = z
  .object({
    bookId: targetIdSchema,
    seriesId: targetIdSchema,
  })
  .refine(exactlyOneTarget, {
    message: 'Exactly one of bookId or seriesId must be set',
    path: ['bookId'],
  });

export const listFavoritesQuerySchema = z.object(limitOffsetShape);

export type CreateFavoriteInput = z.infer<typeof createFavoriteSchema>;
export type ListFavoritesQuery = z.infer<typeof listFavoritesQuerySchema>;
