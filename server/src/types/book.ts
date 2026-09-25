import {
  BOOK_SORTS,
  BOOK_STATUSES,
  PAGE_SIZE_MAX,
  RANGE_ORDER,
  SEARCH_TEXT_MAX_LENGTH,
  SEARCHABLE_BOOK_STATUSES,
} from 'shared';
import { z } from 'zod';
import { idSchema } from './params.ts';

const BOOK_TAG_MAX_LENGTH = 32;
const BOOK_MAX_TAGS = 20;
const BOOK_DESCRIPTION_MAX_LENGTH = 5000;
const BOOK_TITLE_MAX_LENGTH = 255;

// Duplicates carry no meaning in a tag set, and JSON_CONTAINS ignores them
// anyway — collapsing them here keeps what lands in the JSON column canonical.
const tagListSchema = z
  .array(z.string().trim().min(1).max(BOOK_TAG_MAX_LENGTH))
  .max(BOOK_MAX_TAGS)
  .transform((tags) => [...new Set(tags)]);

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
  // A Genre is optional, and an absent key means the same as an explicit null:
  // no Genre (A6). `.optional()` rather than the `.default(null)` seriesId
  // above carries, so the parsed input holds the key only when the caller
  // named one — the column is nullable, so an absent key already lands as
  // NULL, and the repository has one less value to tell apart.
  genreId: idSchema.nullable().optional(),
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
    // As seriesId: an explicit null clears the Genre, and an absent key leaves
    // it alone, because `.partial()` adds no default (A6).
    genreId: idSchema.nullable(),
  })
  .partial()
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one field must be provided',
  });

// Trimmed before the length checks, so a whitespace-only term is a 400
// rather than a filter that matches everything.
const searchTextSchema = z.string().trim().min(1).max(SEARCH_TEXT_MAX_LENGTH);

// The client sends the start of a "from" day and the end of a "to" day in its
// own time zone, as ISO instants, so the server compares instants only.
const instantSchema = z.iso
  .datetime({ offset: true })
  .transform((value) => new Date(value));

const inOrder = (from: Date | undefined, to: Date | undefined): boolean =>
  from === undefined || to === undefined || from <= to;

export const listBooksQuerySchema = z
  .object({
    current: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(PAGE_SIZE_MAX).default(20),
    userId: idSchema.optional(),
    seriesId: idSchema.optional(),
    genreId: idSchema.optional(),
    tag: z.string().min(1).max(BOOK_TAG_MAX_LENGTH).optional(),
    q: searchTextSchema.optional(),
    // `draft` is not offered: no search lists a Draft book.
    status: z.enum(SEARCHABLE_BOOK_STATUSES).optional(),
    releasedFrom: instantSchema.optional(),
    releasedTo: instantSchema.optional(),
    updatedFrom: instantSchema.optional(),
    updatedTo: instantSchema.optional(),
    author: searchTextSchema.optional(),
    seriesTitle: searchTextSchema.optional(),
    sort: z.enum(BOOK_SORTS).optional(),
  })
  // Pinned to the "from" field, so the client can show it there.
  .refine((query) => inOrder(query.releasedFrom, query.releasedTo), {
    message: RANGE_ORDER,
    path: ['releasedFrom'],
  })
  .refine((query) => inOrder(query.updatedFrom, query.updatedTo), {
    message: RANGE_ORDER,
    path: ['updatedFrom'],
  });

export type CreateBookInput = z.infer<typeof createBookSchema>;
export type UpdateBookInput = z.infer<typeof updateBookSchema>;
export type ListBooksQuery = z.infer<typeof listBooksQuerySchema>;
