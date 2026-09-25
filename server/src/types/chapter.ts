import { z } from 'zod';
import { idSchema } from './params.ts';

export const CHAPTER_TITLE_MAX_LENGTH = 255;
// Comfortably inside MEDIUMTEXT's 16,777,215 bytes: even if every character
// were a 4-byte astral one, a million of them reach 4 MB.
export const CHAPTER_TEXT_MAX_LENGTH = 1_000_000;

// Trimmed, unlike the descriptions on series and books: a leading space in a
// description is harmless, but a title is echoed in every summary list, where
// the stray whitespace is pure noise. Trimming runs before the length checks,
// so a whitespace-only title fails min(1) rather than landing as an empty
// string.
const titleSchema = z.string().trim().min(1).max(CHAPTER_TITLE_MAX_LENGTH);
// Deliberately untrimmed: indentation and trailing blank lines are part of a
// chapter's body, not an input artefact.
const textSchema = z.string().min(1).max(CHAPTER_TEXT_MAX_LENGTH);

// How a save sets the Publication time: `'now'` publishes at the server's
// clock, an ISO instant schedules (the repository refuses one in the past), and
// null keeps or returns the chapter to Draft. 'now' is its own value rather
// than a client-supplied timestamp, so a skewed client clock cannot backdate or
// postdate what "immediately" means.
const publishedAtSchema = z.union([
  z.literal('now'),
  z.iso.datetime({ offset: true }),
  z.null(),
]);

export const createChapterSchema = z.object({
  // Required and non-nullable, unlike books.seriesId: a chapter outside a book
  // is meaningless, which is also why the association cascades.
  bookId: idSchema,
  title: titleSchema,
  text: textSchema,
  // Omitted means Draft: a chapter is only ever out on purpose.
  publishedAt: publishedAtSchema.default(null),
});

// Spelled out rather than derived from createChapterSchema, for the reason
// recorded in types/book.ts: `.partial()` does not undo a `.default()`, and a
// derived schema is one added default away from silently wiping a field.
// bookId is absent by construction — moving a chapter to another book is a
// re-parenting operation, not a field edit. Unlike books.seriesId there is no
// nullable-unlink case to support here.
export const updateChapterSchema = z
  .object({
    title: titleSchema.optional(),
    text: textSchema.optional(),
    // Omitted leaves the Publication time alone, which is how a Published
    // chapter's text is edited: sending any value but null for one is a 400.
    publishedAt: publishedAtSchema.optional(),
    // The updatedAt this save was based on. Required, not optional: a save
    // that skipped it would overwrite a co-author's work without ever being
    // told, which is the one thing this field exists to prevent.
    expectedUpdatedAt: z.iso.datetime({ offset: true }),
  })
  .refine(
    (value) => Object.keys(value).some((key) => key !== 'expectedUpdatedAt'),
    { message: 'At least one field must be provided' }
  );

// A book's whole Reading order, first chapter first. The whole list rather
// than a single move, so the repository can tell when it was drawn from a
// chapter set that has since changed. The cap keeps one request's FIELD()
// argument list bounded without refusing any real book.
export const reorderChaptersSchema = z.object({
  chapterIds: z
    .array(idSchema)
    .min(1)
    .max(5_000)
    .refine((ids) => new Set(ids).size === ids.length, {
      message: 'Each chapter may appear only once',
    }),
});

export const listChaptersQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
  bookId: idSchema.optional(),
  q: z.string().min(1).max(200).optional(),
});

export type CreateChapterInput = z.infer<typeof createChapterSchema>;
export type PublishedAtInput = z.infer<typeof publishedAtSchema>;
export type UpdateChapterInput = z.infer<typeof updateChapterSchema>;
export type ReorderChaptersInput = z.infer<typeof reorderChaptersSchema>;
export type ListChaptersQuery = z.infer<typeof listChaptersQuerySchema>;
