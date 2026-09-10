import { Router } from 'express';
import { createCommentController } from '../controllers/commentController.ts';
import { createOptionalAuth } from '../middleware/optionalAuth.ts';
import { createRequireAuth } from '../middleware/requireAuth.ts';
import { validate } from '../middleware/validate.ts';
import {
  createCommentSchema,
  idParamSchema,
  listCommentsQuerySchema,
  updateCommentSchema,
} from '../types/comment.ts';
import type { RouteDeps } from './index.ts';

export function createCommentRoutes(deps: RouteDeps): Router {
  const controller = createCommentController(deps.commentRepository);
  const requireAuth = createRequireAuth(deps);
  const optionalAuth = createOptionalAuth(deps);
  const router = Router();

  // Reads stay public, like every resource but users — but the list runs
  // through optionalAuth so a signed-in reader's own likes come back with it,
  // without refusing an anonymous one.
  router.get(
    '/',
    optionalAuth,
    validate({ query: listCommentsQuerySchema }),
    controller.list
  );
  router.get('/:id', validate({ params: idParamSchema }), controller.getById);

  // requireAuth goes before validate on every write, so an unauthenticated
  // request is refused without its body being parsed or echoed back in a 400.
  //
  // Unlike the other resources, PATCH and DELETE also check ownership — see
  // controllers/commentController.ts.
  router.post(
    '/',
    requireAuth,
    validate({ body: createCommentSchema }),
    controller.create
  );
  router.patch(
    '/:id',
    requireAuth,
    validate({ params: idParamSchema, body: updateCommentSchema }),
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
