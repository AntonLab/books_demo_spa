import type { Transaction } from 'sequelize';
import { Notification, toPublicNotification } from '../models/Notification.ts';
import { User } from '../models/User.ts';
import type {
  ActorKind,
  ListNotificationsQuery,
  NotificationKind,
  PublicNotification,
  WorkType,
} from '../types/notification.ts';
import type { Role } from '../types/permission.ts';

export interface NotificationListResult {
  items: PublicNotification[];
  total: number;
  unread: number;
}

// Every read and write is scoped to the account named, which the controller
// takes from the session: nobody reaches another account's notifications.
export interface NotificationRepository {
  list(
    userId: number,
    query: ListNotificationsQuery
  ): Promise<NotificationListResult>;
  // Marks those of `ids` that are the account's own, and answers with how
  // many of its notifications are still unread.
  markRead(userId: number, ids: number[]): Promise<number>;
}

// Whoever made a change that raises notifications.
export interface Actor {
  id: number;
  role: Role;
}

// One event and everyone it is told to.
export interface NotificationEvent {
  recipientIds: number[];
  kind: NotificationKind;
  work: { type: WorkType; id: number | null; title: string };
  actorKind: ActorKind;
  actorName: string | null;
}

// Writes one notification per recipient of each event, in a single insert and
// inside the transaction of the change that raised them — so a change that
// rolls back raises nothing, and one that commits cannot lose its
// notifications. The actor is never among the recipients, whoever the caller
// passes; `actorId` is null when no account acted, as for a deleted one.
export async function notify(
  events: NotificationEvent[],
  actorId: number | null,
  transaction: Transaction
): Promise<void> {
  const rows = events.flatMap((event) =>
    [...new Set(event.recipientIds)]
      .filter((userId) => userId !== actorId)
      .map((userId) => ({
        userId,
        kind: event.kind,
        workType: event.work.type,
        bookId: event.work.type === 'book' ? event.work.id : null,
        seriesId: event.work.type === 'series' ? event.work.id : null,
        workTitle: event.work.title,
        actorKind: event.actorKind,
        actorName: event.actorName,
      }))
  );
  if (rows.length === 0) return;

  await Notification.bulkCreate(rows, { transaction });
}

// An account's display name as it is now, for a snapshot that must outlive it.
export async function displayNameOf(
  userId: number,
  transaction: Transaction
): Promise<string | null> {
  const user = await User.findByPk(userId, {
    attributes: ['firstName', 'lastName'],
    transaction,
  });
  return user ? `${user.firstName} ${user.lastName}` : null;
}

// A work's deletion is a Co-author's own decision when they are credited on
// it, and is named as such; anyone else deleting it is a Moderator, who stays
// unnamed.
export async function deleterOf(
  actor: Actor,
  coAuthorIds: number[],
  transaction: Transaction
): Promise<Pick<NotificationEvent, 'actorKind' | 'actorName'>> {
  return coAuthorIds.includes(actor.id)
    ? {
        actorKind: 'co_author',
        actorName: await displayNameOf(actor.id, transaction),
      }
    : { actorKind: 'moderator', actorName: null };
}

export function createSequelizeNotificationRepository(): NotificationRepository {
  return {
    async list(userId, query) {
      const { rows, count } = await Notification.findAndCountAll({
        where: { userId },
        limit: query.limit,
        offset: query.offset,
        order: [['id', 'DESC']],
      });
      const unread = await Notification.count({
        where: { userId, isRead: false },
      });

      return { items: rows.map(toPublicNotification), total: count, unread };
    },

    async markRead(userId, ids) {
      // userId in the WHERE is the whole ownership check: another account's
      // id matches no row here.
      await Notification.update(
        { isRead: true },
        { where: { userId, id: ids, isRead: false } }
      );
      return Notification.count({ where: { userId, isRead: false } });
    },
  };
}
