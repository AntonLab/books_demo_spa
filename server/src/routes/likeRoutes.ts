import { Router } from 'express';
import { createLikeController } from '../controllers/likeController.ts';
import { createRequireAuth } from '../middleware/requireAuth.ts';
import { validate } from '../middleware/validate.ts';
import {
  createLikeSchema,
  idParamSchema,
  listLikesQuerySchema,
  updateLikeSchema,
} from '../types/like.ts';
import type { RouteDeps } from './index.ts';

export function createLikeRoutes(deps: RouteDeps): Router {
  const controller = createLikeController(deps.likeRepository);
  const requireAuth = createRequireAuth(deps);
  const router = Router();

  // Reads stay public: the client's book list must work logged out.
  router.get('/', validate({ query: listLikesQuerySchema }), controller.list);
  router.get('/:id', validate({ params: idParamSchema }), controller.getById);

  // requireAuth goes before validate on every write, so an unauthenticated
  // request is refused without its body being parsed or echoed back in a 400.
  router.post(
    '/',
    requireAuth,
    validate({ body: createLikeSchema }),
    controller.create
  );
  // PATCH carries isLike alone: flipping a like to a dislike is the only
  // field edit a like has. Moving it to another target is re-parenting, and
  // createLikeSchema's XOR is what guards the shape on the way in.
  router.patch(
    '/:id',
    requireAuth,
    validate({ params: idParamSchema, body: updateLikeSchema }),
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
