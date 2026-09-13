import { z } from 'zod';

// The kinds, work types and actor kinds, and the response shape, are the
// client's contract too, so they live in the shared workspace (ADR-0006); the
// schemas stay here.
export {
  ACTOR_KINDS,
  NOTIFICATION_KINDS,
  WORK_TYPES,
  type ActorKind,
  type NotificationKind,
  type PublicNotification,
  type WorkType,
} from 'shared';

export const listNotificationsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});

// The notifications the caller has seen. Ids that are not the caller's are
// ignored rather than refused, so a stale id costs nothing and names nobody
// else's notification.
export const markNotificationsReadSchema = z.object({
  ids: z.array(z.coerce.number().int().positive()).min(1).max(100),
});

export type ListNotificationsQuery = z.infer<
  typeof listNotificationsQuerySchema
>;
export type MarkNotificationsReadInput = z.infer<
  typeof markNotificationsReadSchema
>;
