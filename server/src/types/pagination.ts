import { PAGE_SIZE_MAX } from 'shared';
import { z } from 'zod';

export const limitOffsetShape = {
  limit: z.coerce.number().int().min(1).max(PAGE_SIZE_MAX).default(20),
  offset: z.coerce.number().int().min(0).default(0),
};

export const pageShape = {
  current: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(PAGE_SIZE_MAX).default(20),
};
