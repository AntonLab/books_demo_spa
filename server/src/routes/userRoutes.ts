import { Router } from 'express';
import { createUserController } from '../controllers/userController.ts';
import { createRequireAuth } from '../middleware/requireAuth.ts';
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
  const requireAuth = createRequireAuth(deps);
  const router = Router();

  // Unlike the other four resources, the reads are guarded too: PublicUser
  // carries an email address, so an open list would be a scrapeable directory
  // of every registered account.
  router.get(
    '/',
    requireAuth,
    validate({ query: listUsersQuerySchema }),
    controller.list
  );
  router.get(
    '/:id',
    requireAuth,
    validate({ params: idParamSchema }),
    controller.getById
  );

  // requireAuth goes before validate on every write, so an unauthenticated
  // request is refused without its body being parsed or echoed back in a 400.
  //
  // POST stays guarded here even though POST /api/auth/register is the open
  // door to account creation: this is the administrative create, which accepts
  // a caller-chosen `status` that registration deliberately does not.
  router.post(
    '/',
    requireAuth,
    validate({ body: createUserSchema }),
    controller.create
  );
  router.patch(
    '/:id',
    requireAuth,
    validate({ params: idParamSchema, body: updateUserSchema }),
    controller.update
  );
  router.delete(
    '/:id',
    requireAuth,
    validate({ params: idParamSchema }),
    controller.remove
  );

  return router;
}
