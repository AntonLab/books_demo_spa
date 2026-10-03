import { z } from 'zod';
import { READING_STATUSES } from 'shared';
import { pageShape } from './pagination.ts';
import { idSchema } from './params.ts';

export const setReadingStatusSchema = z.object({
  status: z.enum(READING_STATUSES),
});

export const libraryParamSchema = z.object({ bookId: idSchema });

export const listLibraryQuerySchema = z.object({
  status: z.enum(READING_STATUSES).optional(),
  ...pageShape,
});

export type SetReadingStatusInput = z.infer<typeof setReadingStatusSchema>;
export type ListLibraryQuery = z.infer<typeof listLibraryQuerySchema>;
