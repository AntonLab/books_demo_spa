import {
  READING_LIST_MAX_ITEMS,
  READING_LIST_TITLE_MAX_LENGTH,
  WORK_DESCRIPTION_MAX_LENGTH,
} from 'shared';
import { z } from 'zod';
import { pageShape } from './pagination.ts';
import { idSchema } from './params.ts';
import { workTagListSchema } from './work.ts';

const titleSchema = z.string().trim().min(1).max(READING_LIST_TITLE_MAX_LENGTH);
const descriptionSchema = z.string().max(WORK_DESCRIPTION_MAX_LENGTH);

// No userId: the owner is whoever is signed in. An empty description is fine,
// unlike a Book's: a list may be only a title.
export const createReadingListSchema = z.object({
  title: titleSchema,
  description: descriptionSchema.default(''),
  tags: workTagListSchema.default([]),
});

// Spelled out rather than derived: `.partial()` does not undo a `.default()`,
// so a PATCH without `tags` would wipe them (see types/series.ts).
export const updateReadingListSchema = z
  .object({
    title: titleSchema,
    description: descriptionSchema,
    tags: workTagListSchema,
  })
  .partial()
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one field must be provided',
  });

// Nullable and defaulted to null, as in types/favorite.ts.
const targetIdSchema = idSchema.nullable().default(null);

export const addReadingListItemSchema = z
  .object({ bookId: targetIdSchema, seriesId: targetIdSchema })
  .refine((value) => (value.bookId === null) !== (value.seriesId === null), {
    message: 'Exactly one of bookId or seriesId must be set',
    path: ['bookId'],
  });

export const readingListItemParamSchema = z.object({
  id: idSchema,
  itemId: idSchema,
});

// The whole item order, so the repository can tell when it was drawn from a
// list that has since changed.
export const reorderReadingListItemsSchema = z.object({
  itemIds: z
    .array(idSchema)
    .min(1)
    .max(READING_LIST_MAX_ITEMS)
    .refine((ids) => new Set(ids).size === ids.length, {
      message: 'Each item may appear only once',
    }),
});

const paging = {
  ...pageShape,
};

// A user's lists or the lists holding a Book, never both.
export const listReadingListsQuerySchema = z.union([
  z.strictObject({ userId: idSchema, ...paging }),
  z.strictObject({ bookId: idSchema, ...paging }),
]);

// Neither is allowed: no `itemId` is then computed.
export const myReadingListsQuerySchema = z
  .object({ bookId: idSchema.optional(), seriesId: idSchema.optional() })
  .refine(
    (value) => value.bookId === undefined || value.seriesId === undefined,
    {
      message: 'At most one of bookId or seriesId may be set',
      path: ['bookId'],
    }
  );

export type CreateReadingListInput = z.infer<typeof createReadingListSchema>;
export type UpdateReadingListInput = z.infer<typeof updateReadingListSchema>;
export type AddReadingListItemInput = z.infer<typeof addReadingListItemSchema>;
export type ReorderReadingListItemsInput = z.infer<
  typeof reorderReadingListItemsSchema
>;
export type ListReadingListsQuery = z.infer<typeof listReadingListsQuerySchema>;
export type ListReadingListsByOwnerQuery = Extract<
  ListReadingListsQuery,
  { userId: number }
>;
export type ListReadingListsByBookQuery = Extract<
  ListReadingListsQuery,
  { bookId: number }
>;
export type MyReadingListsQuery = z.infer<typeof myReadingListsQuerySchema>;
