import { z } from 'zod';
import { READING_PROGRESS_EVENTS, READING_STATUSES } from 'shared';
import { pageShape } from './pagination.ts';
import { idSchema } from './params.ts';

export const setReadingStatusSchema = z.object({
  status: z.enum(READING_STATUSES),
});

export const readingProgressSchema = z.object({
  event: z.enum(READING_PROGRESS_EVENTS),
  chapterId: idSchema,
});

export const libraryParamSchema = z.object({ bookId: idSchema });

export const librarySeriesParamSchema = z.object({ seriesId: idSchema });

export const listLibraryQuerySchema = z.object({
  status: z.enum(READING_STATUSES).optional(),
  ...pageShape,
});

export type SetReadingStatusInput = z.infer<typeof setReadingStatusSchema>;
export type ReadingProgressInput = z.infer<typeof readingProgressSchema>;
export type ListLibraryQuery = z.infer<typeof listLibraryQuerySchema>;
