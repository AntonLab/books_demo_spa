import { WORK_DESCRIPTION_MAX_LENGTH, WORK_TITLE_MAX_LENGTH } from 'shared';
import { z } from 'zod';

// The fields a Book and a Series share, so the two schemas cannot drift.

// Only the server checks these two: the client's tag Select does not. The tag
// length also bounds the `tag` filter of both list queries.
export const WORK_TAG_MAX_LENGTH = 32;
const WORK_MAX_TAGS = 20;

// Duplicates carry no meaning in a tag set, and JSON_CONTAINS ignores them
// anyway — collapsing them here keeps what lands in the JSON column canonical.
export const workTagListSchema = z
  .array(z.string().trim().min(1).max(WORK_TAG_MAX_LENGTH))
  .max(WORK_MAX_TAGS)
  .transform((tags) => [...new Set(tags)]);

export const workDescriptionSchema = z
  .string()
  .min(1)
  .max(WORK_DESCRIPTION_MAX_LENGTH);

// Trimmed, unlike the description and for the reason recorded in
// types/chapter.ts: a title is echoed in every summary list, where stray
// whitespace is pure noise. Trimming runs before the length checks, so a
// whitespace-only title fails min(1) rather than landing as an empty string.
export const workTitleSchema = z
  .string()
  .trim()
  .min(1)
  .max(WORK_TITLE_MAX_LENGTH);
