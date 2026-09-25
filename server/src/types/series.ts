import { z } from 'zod';
import { idSchema } from './params.ts';

const SERIES_TAG_MAX_LENGTH = 32;
const SERIES_MAX_TAGS = 20;
const SERIES_DESCRIPTION_MAX_LENGTH = 5000;
const SERIES_TITLE_MAX_LENGTH = 255;

// Duplicates carry no meaning in a tag set, and JSON_CONTAINS ignores them
// anyway — collapsing them here keeps what lands in the JSON column canonical.
const tagListSchema = z
  .array(z.string().trim().min(1).max(SERIES_TAG_MAX_LENGTH))
  .max(SERIES_MAX_TAGS)
  .transform((tags) => [...new Set(tags)]);

const descriptionSchema = z.string().min(1).max(SERIES_DESCRIPTION_MAX_LENGTH);
// Trimmed, unlike descriptionSchema and for the reason recorded in
// types/chapter.ts: a title is echoed in every summary list, where stray
// whitespace is pure noise. Trimming runs before the length checks, so a
// whitespace-only title fails min(1) rather than landing as an empty string.
const titleSchema = z.string().trim().min(1).max(SERIES_TITLE_MAX_LENGTH);

// No userId: the first Co-author is whoever is signed in, never someone the
// body names. Without that, an author could create a series credited to
// someone else, and "you may only edit series you co-author" would mean
// nothing.
export const createSeriesSchema = z.object({
  title: titleSchema,
  description: descriptionSchema,
  // Defaulted here rather than in the column: MySQL forbids a literal DEFAULT
  // on a JSON column, so the empty array has to come from the application.
  tags: tagListSchema.default([]),
  // A Genre is optional, and an absent key means the same as an explicit null:
  // no Genre. A Series' Genre is its own — nothing is inherited in either
  // direction between a Series and its Books (ADR-0008).
  genreId: idSchema.nullable().optional(),
});

// Spelled out rather than derived from createSeriesSchema with
// `.omit().partial()`, because `.partial()` does not undo a `.default()` — a
// PATCH body without `tags` would still parse as `tags: []` and wipe the
// stored tags. Who is credited is not a field here either: Co-authors change
// through /api/series/:id/co-authors.
export const updateSeriesSchema = z
  .object({
    title: titleSchema,
    description: descriptionSchema,
    tags: tagListSchema,
    // An explicit null clears the Genre, and an absent key leaves it alone,
    // because `.partial()` adds no default.
    genreId: idSchema.nullable(),
  })
  .partial()
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one field must be provided',
  });

export const listSeriesQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
  userId: idSchema.optional(),
  genreId: idSchema.optional(),
  tag: z.string().min(1).max(SERIES_TAG_MAX_LENGTH).optional(),
  q: z.string().min(1).max(200).optional(),
});

export const seriesBookParamSchema = z.object({
  id: idSchema,
  bookId: idSchema,
});

// A series' whole Series order, first book first. The whole list rather than
// a single move, so the repository can tell when it was drawn from a set of
// books that has since changed — the same contract as a book's chapter order.
export const reorderSeriesBooksSchema = z.object({
  bookIds: z
    .array(idSchema)
    .min(1)
    .max(1_000)
    .refine((ids) => new Set(ids).size === ids.length, {
      message: 'Each book may appear only once',
    }),
});

export type ReorderSeriesBooksInput = z.infer<typeof reorderSeriesBooksSchema>;
export type CreateSeriesInput = z.infer<typeof createSeriesSchema>;
export type UpdateSeriesInput = z.infer<typeof updateSeriesSchema>;
export type ListSeriesQuery = z.infer<typeof listSeriesQuerySchema>;
