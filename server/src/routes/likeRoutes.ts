import { Router } from 'express';
import { createLikeController } from '../controllers/likeController.ts';
import { validate } from '../middleware/validate.ts';
import type { LikeRepository } from '../repositories/likeRepository.ts';
import {
  createLikeSchema,
  idParamSchema,
  listLikesQuerySchema,
  updateLikeSchema,
} from '../types/like.ts';

export function createLikeRoutes(repository: LikeRepository): Router {
  const controller = createLikeController(repository);
  const router = Router();

  router.post('/', validate({ body: createLikeSchema }), controller.create);
  router.get('/', validate({ query: listLikesQuerySchema }), controller.list);
  router.get('/:id', validate({ params: idParamSchema }), controller.getById);
  // PATCH carries isLike alone: flipping a like to a dislike is the only
  // field edit a like has. Moving it to another target is re-parenting, and
  // createLikeSchema's XOR is what guards the shape on the way in.
  router.patch(
    '/:id',
    validate({ params: idParamSchema, body: updateLikeSchema }),
    controller.update
  );
  router.delete('/:id', validate({ params: idParamSchema }), controller.remove);

  return router;
}
