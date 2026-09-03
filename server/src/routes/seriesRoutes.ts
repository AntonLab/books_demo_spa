import { Router } from 'express';
import { createSeriesController } from '../controllers/seriesController.ts';
import { createRequireAuth } from '../middleware/requireAuth.ts';
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
  const requireAuth = createRequireAuth(deps);
  const router = Router();

  // Reads stay public: the client's book list must work logged out.
  router.get('/', validate({ query: listSeriesQuerySchema }), controller.list);
  router.get('/:id', validate({ params: idParamSchema }), controller.getById);

  // requireAuth goes before validate on every write, so an unauthenticated
  // request is refused without its body being parsed or echoed back in a 400.
  router.post(
    '/',
    requireAuth,
    validate({ body: createSeriesSchema }),
    controller.create
  );
  router.patch(
    '/:id',
    requireAuth,
    validate({ params: idParamSchema, body: updateSeriesSchema }),
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
