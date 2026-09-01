import { z } from 'zod';

export const BOOK_TAG_MAX_LENGTH = 32;
export const BOOK_MAX_TAGS = 20;
export const BOOK_DESCRIPTION_MAX_LENGTH = 5000;

// Duplicates carry no meaning in a tag set, and JSON_CONTAINS ignores them
// anyway — collapsing them here keeps what lands in the JSON column canonical.
const tagListSchema = z
  .array(z.string().trim().min(1).max(BOOK_TAG_MAX_LENGTH))
  .max(BOOK_MAX_TAGS)
  .transform((tags) => [...new Set(tags)]);

const idSchema = z.coerce.number().int().positive();
const descriptionSchema = z.string().min(1).max(BOOK_DESCRIPTION_MAX_LENGTH);

export const createBookSchema = z.object({
  userId: idSchema,
  // Optional by design: a book need not belong to a series. Both an omitted
  // key and an explicit null land as null, so the column has one empty value
  // rather than two.
  seriesId: idSchema.nullable().default(null),
  description: descriptionSchema,
  // Defaulted here rather than in the column: MySQL forbids a literal DEFAULT
  // on a JSON column, so the empty array has to come from the application.
  tags: tagListSchema.default([]),
});

// Spelled out rather than derived from createBookSchema with
// `.omit().partial()`, for two reasons. userId is absent by construction:
// ownership is decided at creation, and moving a book between users is a
// re-parenting operation, not a field edit. And `.partial()` does not undo a
// `.default()` — a PATCH body without `tags` would still parse as `tags: []`
// and wipe the stored tags, and one without `seriesId` would unlink the book.
//
// seriesId *is* editable here, unlike userId: a book moving into or out of a
// series is an ordinary edit, and an explicit `"seriesId": null` unlinks it.
export const updateBookSchema = z
  .object({
    seriesId: idSchema.nullable(),
    description: descriptionSchema,
    tags: tagListSchema,
  })
  .partial()
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one field must be provided',
  });

export const listBooksQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
  userId: idSchema.optional(),
  seriesId: idSchema.optional(),
  tag: z.string().min(1).max(BOOK_TAG_MAX_LENGTH).optional(),
  q: z.string().min(1).max(200).optional(),
});

// Deliberately a local copy of the users' and series' param schema rather than
// an import: the three resources share a shape today, not a reason to change
// together.
export const idParamSchema = z.object({
  id: z.coerce.number().int().positive(),
});

export type CreateBookInput = z.infer<typeof createBookSchema>;
export type UpdateBookInput = z.infer<typeof updateBookSchema>;
export type ListBooksQuery = z.infer<typeof listBooksQuerySchema>;

export interface PublicBook {
  id: number;
  userId: number;
  seriesId: number | null;
  description: string;
  tags: string[];
  createdAt: Date;
  updatedAt: Date;
}
