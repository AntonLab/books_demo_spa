import { GENRE_NAME_MAX_LENGTH } from 'shared';
import { z } from 'zod';

// Trimmed before the length checks, as every title in this codebase is, so a
// whitespace-only name fails min(1) rather than landing as an empty string.
// Case is kept exactly as typed: "Hard SF" is stored as written, and the
// unique index — not this schema — is what refuses another casing of it (M1).
const nameSchema = z.string().trim().min(1).max(GENRE_NAME_MAX_LENGTH);

// One schema for both writes, unlike the create/update pairs elsewhere in this
// directory: A2 and A3 take the same body — one required name — and there is
// no `.default()` here for `.partial()` to undo, which is the reason those
// pairs are spelled out separately.
export const genreBodySchema = z.object({
  name: nameSchema,
});

export type GenreInput = z.infer<typeof genreBodySchema>;

// stringbool, not z.coerce.boolean(): coercion turns "false" into true.
export const listGenresQuerySchema = z.object({
  nonEmpty: z.stringbool().optional(),
});

export type ListGenresQuery = z.infer<typeof listGenresQuerySchema>;
