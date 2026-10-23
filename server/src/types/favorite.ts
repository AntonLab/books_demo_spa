import { z } from 'zod';
import { limitOffsetShape } from './pagination.ts';
import { idSchema } from './params.ts';
import { exactlyOneSet } from './target.ts';

// Nullable and defaulted to null, as in types/like.ts: an omitted key and an
// explicit null reach the refine as the same value.
const targetIdSchema = idSchema.nullable().default(null);

// No userId: the holder comes from the session, or the unique indexes would
// enforce "one favorite per *claimed* account".
//
// The exactly-one-target rule is enforced again by the model validate in
// models/Favorite.ts, because a caller reaching Sequelize directly never passes
// through zod; migration 0003 adds the CHECK behind it.
export const createFavoriteSchema = z
  .object({
    bookId: targetIdSchema,
    seriesId: targetIdSchema,
  })
  .refine((value) => exactlyOneSet(value.bookId, value.seriesId), {
    message: 'Exactly one of bookId or seriesId must be set',
    path: ['bookId'],
  });

export const listFavoritesQuerySchema = z.object(limitOffsetShape);

export type CreateFavoriteInput = z.infer<typeof createFavoriteSchema>;
export type ListFavoritesQuery = z.infer<typeof listFavoritesQuerySchema>;
