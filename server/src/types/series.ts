import { z } from 'zod';

export const SERIES_TAG_MAX_LENGTH = 32;
export const SERIES_MAX_TAGS = 20;
export const SERIES_DESCRIPTION_MAX_LENGTH = 5000;
export const SERIES_TITLE_MAX_LENGTH = 255;

// Duplicates carry no meaning in a tag set, and JSON_CONTAINS ignores them
// anyway — collapsing them here keeps what lands in the JSON column canonical.
const tagListSchema = z
  .array(z.string().trim().min(1).max(SERIES_TAG_MAX_LENGTH))
  .max(SERIES_MAX_TAGS)
  .transform((tags) => [...new Set(tags)]);

const userIdSchema = z.coerce.number().int().positive();
const descriptionSchema = z.string().min(1).max(SERIES_DESCRIPTION_MAX_LENGTH);
// Trimmed, unlike descriptionSchema and for the reason recorded in
// types/chapter.ts: a title is echoed in every summary list, where stray
// whitespace is pure noise. Trimming runs before the length checks, so a
// whitespace-only title fails min(1) rather than landing as an empty string.
const titleSchema = z.string().trim().min(1).max(SERIES_TITLE_MAX_LENGTH);

// No userId: the owner comes from the session, never the body. Without that,
// an author could create a series owned by someone else, and "you may only
// edit your own series" would mean nothing.
export const createSeriesSchema = z.object({
  title: titleSchema,
  description: descriptionSchema,
  // Defaulted here rather than in the column: MySQL forbids a literal DEFAULT
  // on a JSON column, so the empty array has to come from the application.
  tags: tagListSchema.default([]),
});

// Spelled out rather than derived from createSeriesSchema with
// `.omit().partial()`, for two reasons. userId is absent by construction:
// ownership is decided at creation, and moving a series between users is a
// re-parenting operation, not a field edit. And `.partial()` does not undo a
// `.default()` — a PATCH body without `tags` would still parse as `tags: []`
// and wipe the stored tags.
export const updateSeriesSchema = z
  .object({
    title: titleSchema,
    description: descriptionSchema,
    tags: tagListSchema,
  })
  .partial()
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one field must be provided',
  });

export const listSeriesQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
  userId: userIdSchema.optional(),
  tag: z.string().min(1).max(SERIES_TAG_MAX_LENGTH).optional(),
  q: z.string().min(1).max(200).optional(),
});

// Deliberately a local copy of the users' param schema rather than an import:
// the two resources share a shape today, not a reason to change together.
export const idParamSchema = z.object({
  id: z.coerce.number().int().positive(),
});

export type CreateSeriesInput = z.infer<typeof createSeriesSchema>;
export type UpdateSeriesInput = z.infer<typeof updateSeriesSchema>;
export type ListSeriesQuery = z.infer<typeof listSeriesQuerySchema>;

export interface PublicSeries {
  id: number;
  userId: number;
  title: string;
  description: string;
  tags: string[];
  createdAt: Date;
  updatedAt: Date;
}
