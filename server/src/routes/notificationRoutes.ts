import { Router } from 'express';
import { createNotificationController } from '../controllers/notificationController.ts';
import { createRequireAuth } from '../middleware/requireAuth.ts';
import { validate } from '../middleware/validate.ts';
import {
  listNotificationsQuerySchema,
  markNotificationsReadSchema,
} from '../types/notification.ts';
import type { RouteDeps } from './index.ts';

// Behind requireAuth rather than the permission matrix: a notification is not
// a resource one role may reach and another may not. Every signed-in account
// has its own and no other, which the session alone decides.
export function createNotificationRoutes(deps: RouteDeps): Router {
  const controller = createNotificationController(deps.notificationRepository);
  const requireAuth = createRequireAuth(deps);
  const router = Router();

  router.get(
    '/',
    requireAuth,
    validate({ query: listNotificationsQuerySchema }),
    controller.list
  );
  router.post(
    '/read',
    requireAuth,
    validate({ body: markNotificationsReadSchema }),
    controller.markRead
  );

  return router;
}
