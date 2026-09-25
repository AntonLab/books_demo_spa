import express, { Router, type Request } from 'express';
import { createUserController } from '../controllers/userController.ts';
import { createRequirePermission } from '../middleware/requirePermission.ts';
import {
  validate,
  validatedBody,
  validatedParams,
} from '../middleware/validate.ts';
import {
  ACCEPTED_IMAGE_CONTENT_TYPES,
  IMAGE_MAX_BYTES,
  REGISTRABLE_ROLES,
} from 'shared';
import {
  createUserSchema,
  listUsersQuerySchema,
  updateRoleSchema,
  updateUserSchema,
  type UpdateRoleInput,
} from '../types/user.ts';
import { idParamSchema } from '../types/params.ts';
import {
  ForbiddenError,
  NotFoundError,
  UnauthorizedError,
} from '../types/errors.ts';
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
    async (req: Request, res) => {
      if (!req.user) throw new UnauthorizedError();

      const { id } = validatedParams<{ id: number }>(req);
      const { role } = validatedBody<UpdateRoleInput>(req);

      const isSuperadmin = req.user.role === 'superadmin';
      const isOwnRow = req.user.id === id;
      const isSelfServiceRole = (
        REGISTRABLE_ROLES as readonly string[]
      ).includes(role);

      // A superadmin's own role is another superadmin's call. Stepping down
      // would otherwise be one request away from the self-deletion they may
      // not make — and the last superadmin stepping down strands the system.
      if (isSuperadmin && isOwnRow) {
        throw new ForbiddenError('A superadmin may not change their own role');
      }

      // Switching between user and author is a statement of intent, not a
      // privilege — the real protection is that an author may only touch their
      // own rows. Everything above that is superadmin's alone.
      if (!isSuperadmin && !(isOwnRow && isSelfServiceRole)) {
        throw new ForbiddenError('You may not set that role');
      }

      const user = await deps.userRepository.updateRole(id, role);
      if (!user) throw new NotFoundError('User', id);
      res.json(user);
    }
  );
  router.delete(
    '/:id',
    requirePermission('users', 'delete'),
    validate({ params: idParamSchema }),
    controller.remove
  );

  // The raw body parser is mounted on this PUT alone, never app-wide,
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
  // Deliberately no requirePermission here — an avatar is public.
  // /:id/avatar cannot collide with /:id, the same reason /:id/role cannot.
  router.get(
    '/:id/avatar',
    validate({ params: idParamSchema }),
    controller.getAvatar
  );

  return router;
}
