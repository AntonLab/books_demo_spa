import { GENRE_NAME_MAX_LENGTH } from 'shared';
import { z } from 'zod';

// The response shape and the length the client validates against are the
// client's contract too, so they live in the shared workspace (ADR-0006); the
// schemas stay here.
export { GENRE_NAME_MAX_LENGTH, type PublicGenre } from 'shared';

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

// Deliberately a local copy of the users', series' and books' param schema
// rather than an import: the resources share a shape today, not a reason to
// change together.
export const idParamSchema = z.object({
  id: z.coerce.number().int().positive(),
});

export type GenreInput = z.infer<typeof genreBodySchema>;
