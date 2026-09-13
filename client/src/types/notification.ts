import type { ListResponse } from './api';

// A mirror of the server's PublicNotification: a snapshot of who changed the
// credits on a shared work, taken when it happened.
export type NotificationKind =
  | 'co_author_added'
  | 'co_author_removed'
  | 'co_author_left'
  | 'co_author_account_deleted'
  | 'work_deleted';

export interface PublicNotification {
  id: number;
  kind: NotificationKind;
  // `id` is null once the work is gone: name it, but do not link to it.
  work: { type: 'book' | 'series'; id: number | null; title: string };
  // `name` is set for a Co-author only; a Moderator and a deleted account are
  // never named.
  actor: {
    kind: 'co_author' | 'moderator' | 'deleted_account';
    name: string | null;
  };
  isRead: boolean;
  createdAt: string;
}

export type NotificationList = ListResponse<PublicNotification> & {
  unread: number;
};
