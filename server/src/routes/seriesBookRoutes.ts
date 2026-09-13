import { Router } from 'express';
import { createBookController } from '../controllers/bookController.ts';
import { createRequirePermission } from '../middleware/requirePermission.ts';
import { validate } from '../middleware/validate.ts';
import { idParamSchema, reorderSeriesBooksSchema } from '../types/series.ts';
import type { RouteDeps } from './index.ts';

// The books of a series as its editor works with them — the full list, drafts
// included, and its Series order. Mounted under /series because both belong
// to the series, but handled by the book controller and repository, because
// both read and write books. Both ride on `series × update`.
export function createSeriesBookRoutes(deps: RouteDeps): Router {
  const controller = createBookController(deps.bookRepository);
  const requirePermission = createRequirePermission(deps);
  const router = Router();

  router.get(
    '/:id/books',
    requirePermission('series', 'update'),
    validate({ params: idParamSchema }),
    controller.listInSeries
  );
  router.put(
    '/:id/book-order',
    requirePermission('series', 'update'),
    validate({ params: idParamSchema, body: reorderSeriesBooksSchema }),
    controller.reorderInSeries
  );

  return router;
}
