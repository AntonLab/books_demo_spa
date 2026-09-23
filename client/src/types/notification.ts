import type * as Shared from 'shared';
import type { Wire } from 'shared';

// A snapshot of who changed the credits on a shared work, taken when it
// happened. `work.id` is null once the work is gone: name it, but do not link
// to it. `actor.name` is set for a Co-author only; a Moderator and a deleted
// account are never named.
export type PublicNotification = Wire<Shared.PublicNotification>;

export type NotificationList = Wire<Shared.NotificationList>;
