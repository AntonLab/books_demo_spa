import { Router } from 'express';
import { createCommentController } from '../controllers/commentController.ts';
import { createRequirePermission } from '../middleware/requirePermission.ts';
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
  const requirePermission = createRequirePermission(deps);
  const router = Router();

  // Every route runs through the matrix, reads included: every role has
  // `read: any` on comments, which is what keeps the list and detail routes
  // public. requirePermission resolves the session itself, so the list no
  // longer needs optionalAuth to get a signed-in reader's own likes back with
  // it.
  router.get(
    '/',
    requirePermission('comments', 'read'),
    validate({ query: listCommentsQuerySchema }),
    controller.list
  );
  router.get(
    '/:id',
    requirePermission('comments', 'read'),
    validate({ params: idParamSchema }),
    controller.getById
  );

  // requirePermission goes before validate on every write, so a refused
  // request is never parsed or echoed back in a 400.
  //
  // Unlike the other resources, PATCH and DELETE also check ownership — see
  // controllers/commentController.ts. There, `own` still refuses another
  // user's comment, but `any` (admin) now skips that check.
  router.post(
    '/',
    requirePermission('comments', 'create'),
    validate({ body: createCommentSchema }),
    controller.create
  );
  router.patch(
    '/:id',
    requirePermission('comments', 'update'),
    validate({ params: idParamSchema, body: updateCommentSchema }),
    controller.update
  );
  router.delete(
    '/:id',
    requirePermission('comments', 'delete'),
    validate({ params: idParamSchema }),
    controller.remove
  );

  return router;
}
