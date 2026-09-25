import { z } from 'zod';
import { idSchema } from './params.ts';

export const listNotificationsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});

// The notifications the caller has seen. Ids that are not the caller's are
// ignored rather than refused, so a stale id costs nothing and names nobody
// else's notification.
export const markNotificationsReadSchema = z.object({
  ids: z.array(idSchema).min(1).max(100),
});

export type ListNotificationsQuery = z.infer<
  typeof listNotificationsQuerySchema
>;
export type MarkNotificationsReadInput = z.infer<
  typeof markNotificationsReadSchema
>;
