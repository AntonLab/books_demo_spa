import { z } from 'zod';
import type { AuthorSummary } from './user.ts';

export const BOOK_TAG_MAX_LENGTH = 32;
export const BOOK_MAX_TAGS = 20;
export const BOOK_DESCRIPTION_MAX_LENGTH = 5000;
export const BOOK_TITLE_MAX_LENGTH = 255;

// The Book status (CONTEXT.md): only `draft` keeps a book from readers;
// `complete` is a label and restricts nothing.
export const BOOK_STATUSES = ['draft', 'in_progress', 'complete'] as const;
export type BookStatus = (typeof BOOK_STATUSES)[number];

// Duplicates carry no meaning in a tag set, and JSON_CONTAINS ignores them
// anyway — collapsing them here keeps what lands in the JSON column canonical.
const tagListSchema = z
  .array(z.string().trim().min(1).max(BOOK_TAG_MAX_LENGTH))
  .max(BOOK_MAX_TAGS)
  .transform((tags) => [...new Set(tags)]);

const idSchema = z.coerce.number().int().positive();
const descriptionSchema = z.string().min(1).max(BOOK_DESCRIPTION_MAX_LENGTH);
// Trimmed, unlike descriptionSchema and for the reason recorded in
// types/chapter.ts: a title is echoed in every summary list, where stray
// whitespace is pure noise. Trimming runs before the length checks, so a
// whitespace-only title fails min(1) rather than landing as an empty string.
const titleSchema = z.string().trim().min(1).max(BOOK_TITLE_MAX_LENGTH);

// No userId: the first Co-author is whoever is signed in, never someone the
// body names. Without that, an author could create a book credited to someone
// else, and "you may only edit books you co-author" would mean nothing.
export const createBookSchema = z.object({
  title: titleSchema,
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
// `.omit().partial()`, because `.partial()` does not undo a `.default()` — a
// PATCH body without `tags` would still parse as `tags: []` and wipe the
// stored tags, and one without `seriesId` would unlink the book. Who is
// credited is not a field here either: Co-authors change through
// /api/books/:id/co-authors.
//
// seriesId *is* editable here: a book moving into or out of a series is an
// ordinary edit, and an explicit `"seriesId": null` unlinks it.
export const updateBookSchema = z
  .object({
    seriesId: idSchema.nullable(),
    title: titleSchema,
    description: descriptionSchema,
    tags: tagListSchema,
    // Any status to any other. Not on the create schema: every book starts as a
    // draft, whatever the body says.
    status: z.enum(BOOK_STATUSES),
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

export const addCoAuthorSchema = z.object({
  userId: idSchema,
});

export const coAuthorParamSchema = z.object({
  id: z.coerce.number().int().positive(),
  userId: z.coerce.number().int().positive(),
});

export type CreateBookInput = z.infer<typeof createBookSchema>;
export type AddCoAuthorInput = z.infer<typeof addCoAuthorSchema>;
export type UpdateBookInput = z.infer<typeof updateBookSchema>;
export type ListBooksQuery = z.infer<typeof listBooksQuerySchema>;

// No userId: a book has no single owner (ADR-0005).
export interface PublicBook {
  id: number;
  // Every Co-author, in the order they were credited. Embedded in the list as
  // well as the detail, so a book card can name them without a second request
  // to /api/users, which is guarded.
  authors: AuthorSummary[];
  seriesId: number | null;
  title: string;
  description: string;
  tags: string[];
  status: BookStatus;
  createdAt: Date;
  updatedAt: Date;
}

// What GET /api/books/:id returns: the record plus the series name a book page
// has to show and the like state it renders. Additive over PublicBook, so the
// endpoint's existing readers are unaffected. The Co-authors come with
// PublicBook itself.
export interface BookDetail extends PublicBook {
  series: { id: number; title: string } | null;
  likeCount: number;
  // null both for an anonymous visitor and for a signed-in one who has not
  // liked this book. The client needs no third state: with no session it hides
  // the button outright.
  viewerLikeId: number | null;
}
