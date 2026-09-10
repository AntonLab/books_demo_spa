import { Router } from 'express';
import { createSeriesController } from '../controllers/seriesController.ts';
import { createRequirePermission } from '../middleware/requirePermission.ts';
import { validate } from '../middleware/validate.ts';
import {
  createSeriesSchema,
  idParamSchema,
  listSeriesQuerySchema,
  updateSeriesSchema,
} from '../types/series.ts';
import type { RouteDeps } from './index.ts';

export function createSeriesRoutes(deps: RouteDeps): Router {
  const controller = createSeriesController(deps.seriesRepository);
  const requirePermission = createRequirePermission(deps);
  const router = Router();

  // Every route runs through the matrix, reads included: `guest` has `read:
  // any` on series, which is what keeps the list and detail routes public.
  router.get(
    '/',
    requirePermission('series', 'read'),
    validate({ query: listSeriesQuerySchema }),
    controller.list
  );
  router.get(
    '/:id',
    requirePermission('series', 'read'),
    validate({ params: idParamSchema }),
    controller.getById
  );

  // requirePermission goes before validate on every write, so a refused
  // request is never parsed or echoed back in a 400.
  router.post(
    '/',
    requirePermission('series', 'create'),
    validate({ body: createSeriesSchema }),
    controller.create
  );
  router.patch(
    '/:id',
    requirePermission('series', 'update'),
    validate({ params: idParamSchema, body: updateSeriesSchema }),
    controller.update
  );
  router.delete(
    '/:id',
    requirePermission('series', 'delete'),
    validate({ params: idParamSchema }),
    controller.remove
  );

  return router;
}
