import express, { Router } from 'express';
import {
  assertOwnRow,
  createUserController,
} from '../controllers/userController.ts';
import { limitEveryRequestByUser } from '../middleware/authRateLimit.ts';
import { createRequirePermission } from '../middleware/requirePermission.ts';
import { validate, validatedParams } from '../middleware/validate.ts';
import { ACCEPTED_IMAGE_CONTENT_TYPES, IMAGE_MAX_BYTES } from 'shared';
import {
  createUserSchema,
  listUsersQuerySchema,
  updateRoleSchema,
  updateUserSchema,
} from '../types/user.ts';
import { idParamSchema } from '../types/params.ts';
import type { RouteDeps } from './index.ts';

export function createUserRoutes(deps: RouteDeps): Router {
  const controller = createUserController(
    deps.userRepository,
    deps.authRateLimits.currentPassword
  );
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
  // The one door for role changes. `users × update` gets the caller through
  // the door; who may set *which* role is decided below, because the matrix
  // grades resources, not values.
  router.patch(
    '/:id/role',
    requirePermission('users', 'update'),
    validate({ params: idParamSchema, body: updateRoleSchema }),
    controller.updateRole
  );
  router.delete(
    '/:id',
    requirePermission('users', 'delete'),
    validate({ params: idParamSchema }),
    controller.remove
  );

  // The raw body parser is mounted on this PUT alone, never app-wide,
  // and after requirePermission so a refused request's 2 MiB is never read.
  // A foreign id is refused before the limiter, so it spends no budget.
  router.put(
    '/:id/avatar',
    requirePermission('users', 'update'),
    validate({ params: idParamSchema }),
    (req, _res, next) => {
      assertOwnRow(req, validatedParams<{ id: number }>(req).id);
      next();
    },
    limitEveryRequestByUser(deps.authRateLimits.upload),
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
  // Deliberately no requirePermission here — an avatar is public.
  // /:id/avatar cannot collide with /:id, the same reason /:id/role cannot.
  router.get(
    '/:id/avatar',
    validate({ params: idParamSchema }),
    controller.getAvatar
  );

  return router;
}
