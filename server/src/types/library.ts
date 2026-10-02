import { z } from 'zod';
import { PAGE_SIZE_MAX, READING_STATUSES } from 'shared';
import { idSchema } from './params.ts';

export const setReadingStatusSchema = z.object({
  status: z.enum(READING_STATUSES),
});

export const libraryParamSchema = z.object({ bookId: idSchema });

export const listLibraryQuerySchema = z.object({
  status: z.enum(READING_STATUSES).optional(),
  current: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(PAGE_SIZE_MAX).default(20),
});

export type SetReadingStatusInput = z.infer<typeof setReadingStatusSchema>;
export type ListLibraryQuery = z.infer<typeof listLibraryQuerySchema>;
