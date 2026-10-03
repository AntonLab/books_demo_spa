import { z } from 'zod';
import { limitOffsetShape } from './pagination.ts';
import { idSchema } from './params.ts';

export const listNotificationsQuerySchema = z.object(limitOffsetShape);

// The notifications the caller has seen. Ids that are not the caller's are
// ignored rather than refused, so a stale id costs nothing and names nobody
// else's notification.
export const markNotificationsReadSchema = z.object({
  ids: z.array(idSchema).min(1).max(100),
});

// Strict so a stray `userId` is a 400 rather than a silently ignored hint
// that settings could be written for someone else.
export const updateNotificationSettingsSchema = z.strictObject({
  emailNotifications: z.boolean(),
});

export type ListNotificationsQuery = z.infer<
  typeof listNotificationsQuerySchema
>;
export type MarkNotificationsReadInput = z.infer<
  typeof markNotificationsReadSchema
>;
export type UpdateNotificationSettingsInput = z.infer<
  typeof updateNotificationSettingsSchema
>;
