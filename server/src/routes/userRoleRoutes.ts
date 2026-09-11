import { Router, type Request } from 'express';
import { createRequirePermission } from '../middleware/requirePermission.ts';
import {
  validate,
  validatedBody,
  validatedParams,
} from '../middleware/validate.ts';
import {
  idParamSchema,
  updateRoleSchema,
  type UpdateRoleInput,
} from '../types/user.ts';
import { REGISTRABLE_ROLES } from '../types/permission.ts';
import {
  ForbiddenError,
  NotFoundError,
  UnauthorizedError,
} from '../types/errors.ts';
import type { RouteDeps } from './index.ts';

// The one door for role changes. It is a route of its own rather than a field
// on PATCH /api/users/:id because updateUserSchema is derived from
// createUserSchema with `.partial()` — a role field on either would appear on
// both, and any signed-in caller could then promote themselves.
export function createUserRoleRoutes(deps: RouteDeps): Router {
  const requirePermission = createRequirePermission(deps);
  const router = Router();

  router.patch(
    '/:id/role',
    // `users × update` gets the caller through the door; who may set *which*
    // role is decided below, because the matrix grades resources, not values.
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

  return router;
}
