import { Router } from 'express';
import { createBookController } from '../controllers/bookController.ts';
import { createOptionalAuth } from '../middleware/optionalAuth.ts';
import { createRequireAuth } from '../middleware/requireAuth.ts';
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
  const requireAuth = createRequireAuth(deps);
  const optionalAuth = createOptionalAuth(deps);
  const router = Router();

  // Reads stay public: the client's book list must work logged out.
  router.get('/', validate({ query: listBooksQuerySchema }), controller.list);
  // optionalAuth, not requireAuth: the route stays public, but a signed-in
  // visitor's id is what fills in viewerLikeId on the detail response.
  router.get(
    '/:id',
    optionalAuth,
    validate({ params: idParamSchema }),
    controller.getById
  );

  // requireAuth goes before validate on every write, so an unauthenticated
  // request is refused without its body being parsed or echoed back in a 400.
  router.post(
    '/',
    requireAuth,
    validate({ body: createBookSchema }),
    controller.create
  );
  router.patch(
    '/:id',
    requireAuth,
    validate({ params: idParamSchema, body: updateBookSchema }),
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
