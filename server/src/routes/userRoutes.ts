import express, { Router } from 'express';
import { createUserController } from '../controllers/userController.ts';
import { createRequirePermission } from '../middleware/requirePermission.ts';
import { validate } from '../middleware/validate.ts';
import {
  ACCEPTED_IMAGE_CONTENT_TYPES,
  IMAGE_MAX_BYTES,
} from '../types/image.ts';
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

  // A4/A5: the raw body parser is mounted on this PUT alone, never app-wide,
  // and after requirePermission so a refused request's 2 MiB is never read.
  router.put(
    '/:id/avatar',
    requirePermission('users', 'update'),
    validate({ params: idParamSchema }),
    express.raw({
      type: [...ACCEPTED_IMAGE_CONTENT_TYPES],
      limit: IMAGE_MAX_BYTES,
    }),
    controller.uploadAvatar
  );
  router.delete(
    '/:id/avatar',
    requirePermission('users', 'update'),
    validate({ params: idParamSchema }),
    controller.removeAvatar
  );
  // A6: deliberately no requirePermission here — an avatar is public.
  // /:id/avatar cannot collide with /:id, the same reason /:id/role cannot.
  router.get(
    '/:id/avatar',
    validate({ params: idParamSchema }),
    controller.getAvatar
  );

  return router;
}
