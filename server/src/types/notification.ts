import { z } from 'zod';

// What happened to the credits on a shared work (CONTEXT.md, Notification).
// Text, status and chapter changes raise none of these by design: a
// Notification is the safeguard ADR-0005 relies on for who is credited, not an
// activity feed.
export const NOTIFICATION_KINDS = [
  'co_author_added',
  'co_author_removed',
  'co_author_left',
  'co_author_account_deleted',
  'work_deleted',
] as const;

export const WORK_TYPES = ['book', 'series'] as const;

// Who the notification says acted. Only a Co-author is named: a Moderator
// acting on someone else's work stays anonymous, and a deleted account has no
// name left to give.
export const ACTOR_KINDS = [
  'co_author',
  'moderator',
  'deleted_account',
] as const;

export type NotificationKind = (typeof NOTIFICATION_KINDS)[number];
export type WorkType = (typeof WORK_TYPES)[number];
export type ActorKind = (typeof ACTOR_KINDS)[number];

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

export interface PublicNotification {
  id: number;
  kind: NotificationKind;
  // The title is the one the work had when the notification was raised; `id`
  // is null once the work is gone, which is how a client knows not to link.
  work: { type: WorkType; id: number | null; title: string };
  // `name` is set only for a Co-author, as they were named at the time.
  actor: { kind: ActorKind; name: string | null };
  isRead: boolean;
  createdAt: Date;
}
