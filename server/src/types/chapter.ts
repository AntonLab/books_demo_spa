import { z } from 'zod';

export const CHAPTER_TITLE_MAX_LENGTH = 255;
// Comfortably inside MEDIUMTEXT's 16,777,215 bytes: even if every character
// were a 4-byte astral one, a million of them reach 4 MB.
export const CHAPTER_TEXT_MAX_LENGTH = 1_000_000;

const idSchema = z.coerce.number().int().positive();

// Trimmed, unlike the descriptions on series and books: a leading space in a
// description is harmless, but a title is echoed in every summary list, where
// the stray whitespace is pure noise. Trimming runs before the length checks,
// so a whitespace-only title fails min(1) rather than landing as an empty
// string.
const titleSchema = z.string().trim().min(1).max(CHAPTER_TITLE_MAX_LENGTH);
// Deliberately untrimmed: indentation and trailing blank lines are part of a
// chapter's body, not an input artefact.
const textSchema = z.string().min(1).max(CHAPTER_TEXT_MAX_LENGTH);

export const createChapterSchema = z.object({
  // Required and non-nullable, unlike books.seriesId: a chapter outside a book
  // is meaningless, which is also why the association cascades.
  bookId: idSchema,
  title: titleSchema,
  text: textSchema,
});

// Spelled out rather than derived from createChapterSchema, for the reason
// recorded in types/book.ts: `.partial()` does not undo a `.default()`, and a
// derived schema is one added default away from silently wiping a field.
// bookId is absent by construction — moving a chapter to another book is a
// re-parenting operation, not a field edit. Unlike books.seriesId there is no
// nullable-unlink case to support here.
export const updateChapterSchema = z
  .object({
    title: titleSchema,
    text: textSchema,
  })
  .partial()
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one field must be provided',
  });

export const listChaptersQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
  bookId: idSchema.optional(),
  q: z.string().min(1).max(200).optional(),
});

// A local copy rather than an import, following the same reasoning as
// types/book.ts: the resources share a shape today, not a reason to change
// together.
export const idParamSchema = z.object({
  id: z.coerce.number().int().positive(),
});

export type CreateChapterInput = z.infer<typeof createChapterSchema>;
export type UpdateChapterInput = z.infer<typeof updateChapterSchema>;
export type ListChaptersQuery = z.infer<typeof listChaptersQuerySchema>;

// The full record, returned by GET /api/chapters/:id.
export interface PublicChapter {
  id: number;
  bookId: number;
  title: string;
  text: string;
  createdAt: Date;
  updatedAt: Date;
}

// What the list endpoint returns: the same record minus the body. Keeping the
// omission in the type (rather than trusting each call site to strip it) is
// what stops a MEDIUMTEXT column from being paged out twenty rows at a time.
export type ChapterSummary = Omit<PublicChapter, 'text'>;
