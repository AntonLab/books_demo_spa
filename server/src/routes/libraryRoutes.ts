import { Router } from 'express';
import { createLibraryController } from '../controllers/libraryController.ts';
import { createRequireAuth } from '../middleware/requireAuth.ts';
import { validate } from '../middleware/validate.ts';
import {
  libraryParamSchema,
  listLibraryQuerySchema,
  setReadingStatusSchema,
} from '../types/library.ts';
import type { RouteDeps } from './index.ts';

// requireAuth rather than the matrix: a Library is the caller's own, so no
// role holds a permission on it.
export function createLibraryRoutes(deps: RouteDeps): Router {
  const controller = createLibraryController(deps.libraryRepository);
  const requireAuth = createRequireAuth(deps);
  const router = Router();

  router.get(
    '/',
    requireAuth,
    validate({ query: listLibraryQuerySchema }),
    controller.list
  );
  router.put(
    '/:bookId',
    requireAuth,
    validate({ params: libraryParamSchema, body: setReadingStatusSchema }),
    controller.set
  );
  router.delete(
    '/:bookId',
    requireAuth,
    validate({ params: libraryParamSchema }),
    controller.clear
  );

  return router;
}
