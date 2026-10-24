import { Router } from 'express';
import { createLibraryController } from '../controllers/libraryController.ts';
import { createRequireAuth } from '../middleware/requireAuth.ts';
import { validate } from '../middleware/validate.ts';
import {
  libraryParamSchema,
  librarySeriesParamSchema,
  listLibraryQuerySchema,
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
  router.post(
    '/:bookId/add',
    requireAuth,
    validate({ params: libraryParamSchema }),
    controller.add
  );
  router.post(
    '/:bookId/not-interested',
    requireAuth,
    validate({ params: libraryParamSchema }),
    controller.toggleNotInterested
  );
  router.post(
    '/series/:seriesId/add',
    requireAuth,
    validate({ params: librarySeriesParamSchema }),
    controller.addSeries
  );
  router.post(
    '/series/:seriesId/not-interested',
    requireAuth,
    validate({ params: librarySeriesParamSchema }),
    controller.toggleSeriesNotInterested
  );
  router.delete(
    '/series/:seriesId',
    requireAuth,
    validate({ params: librarySeriesParamSchema }),
    controller.clearSeries
  );
  router.delete(
    '/:bookId',
    requireAuth,
    validate({ params: libraryParamSchema }),
    controller.clear
  );

  return router;
}
