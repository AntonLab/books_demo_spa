import type { ListResponse } from './api.ts';

// What happened to the credits on a shared work (CONTEXT.md, Notification).
// Text, status and chapter changes raise none of these by design: a
// Notification is the safeguard ADR-0005 relies on for who is credited, not an
// activity feed.
export const CREDIT_NOTIFICATION_KINDS = [
  'co_author_added',
  'co_author_removed',
  'co_author_left',
  'co_author_account_deleted',
  'work_deleted',
] as const;

// Something an Account holds as a Favorite has news (CONTEXT.md, New chapter,
// New book). Raised by the announcement pass, never by `notify`.
export const FAVORITE_NOTIFICATION_KINDS = ['new_chapter', 'new_book'] as const;

export const NOTIFICATION_KINDS = [
  ...CREDIT_NOTIFICATION_KINDS,
  ...FAVORITE_NOTIFICATION_KINDS,
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

export type CreditNotificationKind = (typeof CREDIT_NOTIFICATION_KINDS)[number];
export type FavoriteNotificationKind =
  (typeof FAVORITE_NOTIFICATION_KINDS)[number];
export type NotificationKind = (typeof NOTIFICATION_KINDS)[number];
export type WorkType = (typeof WORK_TYPES)[number];
export type ActorKind = (typeof ACTOR_KINDS)[number];

interface NotificationBase {
  id: number;
  // null while unread.
  readAt: Date | null;
  createdAt: Date;
}

// Every title is the one it had when the notification was raised; an `id` is
// null once its row is gone, which is how a client knows not to link.
export interface CreditNotification extends NotificationBase {
  kind: CreditNotificationKind;
  work: { type: WorkType; id: number | null; title: string };
  // `name` is set only for a Co-author, as they were named at the time.
  actor: { kind: ActorKind; name: string | null };
}

// New chapters of one Book gather into one unread notification: `chapter` is
// the first of them, the one a click opens, and `chapterCount` how many there
// are.
export interface NewChapterNotification extends NotificationBase {
  kind: 'new_chapter';
  work: { type: 'book'; id: number | null; title: string };
  chapter: { id: number | null; title: string };
  chapterCount: number;
}

export interface NewBookNotification extends NotificationBase {
  kind: 'new_book';
  work: { type: 'book'; id: number | null; title: string };
  series: { id: number | null; title: string };
}

export type PublicNotification =
  CreditNotification | NewChapterNotification | NewBookNotification;

// The SSE event name GET /api/notifications/stream sends each notification
// under; the client's EventSource listens for the same one.
export const NOTIFICATION_STREAM_EVENT = 'notification';

// What GET /api/notifications returns: a page like any other, plus the
// account's unread count across every page, which the bell's badge shows.
export interface NotificationList extends ListResponse<PublicNotification> {
  unread: number;
}

// The Account's own switch for Favorite announcement emails, read and written
// at /api/notifications/settings. It never appears in PublicUser, which other
// Accounts' Admins read.
export interface NotificationSettings {
  emailNotifications: boolean;
}
