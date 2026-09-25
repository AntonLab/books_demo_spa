import { Router } from 'express';
import { createLikeController } from '../controllers/likeController.ts';
import { createRequirePermission } from '../middleware/requirePermission.ts';
import { validate } from '../middleware/validate.ts';
import {
  createLikeSchema,
  listLikesQuerySchema,
  updateLikeSchema,
} from '../types/like.ts';
import { idParamSchema } from '../types/params.ts';
import type { RouteDeps } from './index.ts';

export function createLikeRoutes(deps: RouteDeps): Router {
  const controller = createLikeController(deps.likeRepository);
  const requirePermission = createRequirePermission(deps);
  const router = Router();

  // Every route runs through the matrix, reads included: every role has
  // `read: any` on likes, which is what keeps the list and detail routes
  // public — the client's book list must work logged out.
  router.get(
    '/',
    requirePermission('likes', 'read'),
    validate({ query: listLikesQuerySchema }),
    controller.list
  );
  router.get(
    '/:id',
    requirePermission('likes', 'read'),
    validate({ params: idParamSchema }),
    controller.getById
  );

  router.post(
    '/',
    requirePermission('likes', 'create'),
    validate({ body: createLikeSchema }),
    controller.create
  );
  // PATCH carries isLike alone: flipping a like to a dislike is the only
  // field edit a like has. Moving it to another target is re-parenting, and
  // createLikeSchema's XOR is what guards the shape on the way in.
  router.patch(
    '/:id',
    requirePermission('likes', 'update'),
    validate({ params: idParamSchema, body: updateLikeSchema }),
    controller.update
  );
  router.delete(
    '/:id',
    requirePermission('likes', 'delete'),
    validate({ params: idParamSchema }),
    controller.remove
  );

  return router;
}
