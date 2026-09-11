import { Router } from 'express';
import { createBookController } from '../controllers/bookController.ts';
import { createRequirePermission } from '../middleware/requirePermission.ts';
import { validate } from '../middleware/validate.ts';
import {
  createBookSchema,
  idParamSchema,
  listBooksQuerySchema,
  updateBookSchema,
} from '../types/book.ts';
import type { RouteDeps } from './index.ts';

export function createBookRoutes(deps: RouteDeps): Router {
  const controller = createBookController(deps.bookRepository);
  const requirePermission = createRequirePermission(deps);
  const router = Router();

  // Every route runs through the matrix, reads included: `guest` has `read:
  // any` on books, which is what keeps the list and detail routes public.
  router.get(
    '/',
    requirePermission('books', 'read'),
    validate({ query: listBooksQuerySchema }),
    controller.list
  );
  // No separate optionalAuth: requirePermission resolves the session itself
  // and sets req.user whenever one exists, so the detail handler still fills
  // in viewerLikeId for a signed-in caller.
  router.get(
    '/:id',
    requirePermission('books', 'read'),
    validate({ params: idParamSchema }),
    controller.getById
  );

  // requirePermission goes before validate on every write, so a refused
  // request is never parsed or echoed back in a 400.
  router.post(
    '/',
    requirePermission('books', 'create'),
    validate({ body: createBookSchema }),
    controller.create
  );
  router.patch(
    '/:id',
    requirePermission('books', 'update'),
    validate({ params: idParamSchema, body: updateBookSchema }),
    controller.update
  );
  router.delete(
    '/:id',
    requirePermission('books', 'delete'),
    validate({ params: idParamSchema }),
    controller.remove
  );

  return router;
}
