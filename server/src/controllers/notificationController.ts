import type { RequestHandler } from 'express';
import { validatedBody, validatedQuery } from '../middleware/validate.ts';
import type { NotificationRepository } from '../repositories/notificationRepository.ts';
import { actorOf } from '../repositories/visibility.ts';
import type {
  ListNotificationsQuery,
  MarkNotificationsReadInput,
} from '../types/notification.ts';

// Whose notifications these are comes from the session and nowhere else: there
// is no userId in any query or body here to name someone else's.
export function createNotificationController(
  repository: NotificationRepository
) {
  return {
    list: async (req, res) => {
      const { id } = actorOf(req);
      const query = validatedQuery<ListNotificationsQuery>(req);
      const { items, total, unread } = await repository.list(id, query);
      res.json({
        items,
        total,
        unread,
        limit: query.limit,
        offset: query.offset,
      });
    },

    markRead: async (req, res) => {
      const { id } = actorOf(req);
      const { ids } = validatedBody<MarkNotificationsReadInput>(req);
      res.json({ unread: await repository.markRead(id, ids) });
    },
  } satisfies Record<string, RequestHandler>;
}
