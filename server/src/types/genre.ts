import { GENRE_NAME_MAX_LENGTH } from 'shared';
import { z } from 'zod';

// Trimmed before the length checks, as every title in this codebase is, so a
// whitespace-only name fails min(1) rather than landing as an empty string.
// Case is kept exactly as typed: "Hard SF" is stored as written, and the
// unique index — not this schema — is what refuses another casing of it.
const nameSchema = z.string().trim().min(1).max(GENRE_NAME_MAX_LENGTH);

// null is a top-level Genre; a number names the parent of a Subgenre.
const parentIdSchema = z.int().positive().nullable();

export const genreBodySchema = z.object({
  name: nameSchema,
  parentId: parentIdSchema.optional(),
});

export type GenreInput = z.infer<typeof genreBodySchema>;

// Any subset of the create body, but not nothing: an empty PATCH is a client
// mistake, not a no-op worth a round trip.
export const genreUpdateSchema = z
  .object({
    name: nameSchema.optional(),
    parentId: parentIdSchema.optional(),
  })
  .refine((body) => Object.keys(body).length > 0, {
    message: 'Provide at least one field to change',
  });

export type GenreUpdateInput = z.infer<typeof genreUpdateSchema>;

// stringbool, not z.coerce.boolean(): coercion turns "false" into true.
export const listGenresQuerySchema = z.object({
  nonEmpty: z.stringbool().optional(),
});

export type ListGenresQuery = z.infer<typeof listGenresQuerySchema>;
