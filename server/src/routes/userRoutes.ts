import { Router } from 'express';
import { createUserController } from '../controllers/userController.ts';
import { createRequirePermission } from '../middleware/requirePermission.ts';
import { validate } from '../middleware/validate.ts';
import {
  createUserSchema,
  idParamSchema,
  listUsersQuerySchema,
  updateUserSchema,
} from '../types/user.ts';
import type { RouteDeps } from './index.ts';

export function createUserRoutes(deps: RouteDeps): Router {
  const controller = createUserController(deps.userRepository);
  const requirePermission = createRequirePermission(deps);
  const router = Router();

  // Unlike the other four resources, the reads are guarded too: PublicUser
  // carries an email address, so an open list would be a scrapeable directory
  // of every registered account.
  router.get(
    '/',
    requirePermission('users', 'read'),
    validate({ query: listUsersQuerySchema }),
    controller.list
  );
  router.get(
    '/:id',
    requirePermission('users', 'read'),
    validate({ params: idParamSchema }),
    controller.getById
  );

  // requirePermission goes before validate on every write, so a refused
  // request is never parsed or echoed back in a 400.
  //
  // POST stays guarded here even though POST /api/auth/register is the open
  // door to account creation: this is the administrative create, which accepts
  // a caller-chosen `status` that registration deliberately does not — the
  // matrix only grants `users × create` to superadmin.
  router.post(
    '/',
    requirePermission('users', 'create'),
    validate({ body: createUserSchema }),
    controller.create
  );
  // `own` for user/author (edit only your own account), `any` for admin and
  // above — assertMayTouch in the controller enforces `own`, since the row
  // is not loaded here yet. `role` cannot ride in on this route:
  // updateUserSchema never carries it, so promotion has to go through
  // PATCH /:id/role instead.
  router.patch(
    '/:id',
    requirePermission('users', 'update'),
    validate({ params: idParamSchema, body: updateUserSchema }),
    controller.update
  );
  router.delete(
    '/:id',
    requirePermission('users', 'delete'),
    validate({ params: idParamSchema }),
    controller.remove
  );

  return router;
}
