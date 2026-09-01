import { Router } from 'express';
import { createSeriesController } from '../controllers/seriesController.ts';
import { validate } from '../middleware/validate.ts';
import type { SeriesRepository } from '../repositories/seriesRepository.ts';
import {
  createSeriesSchema,
  idParamSchema,
  listSeriesQuerySchema,
  updateSeriesSchema,
} from '../types/series.ts';

export function createSeriesRoutes(repository: SeriesRepository): Router {
  const controller = createSeriesController(repository);
  const router = Router();

  router.post('/', validate({ body: createSeriesSchema }), controller.create);
  router.get('/', validate({ query: listSeriesQuerySchema }), controller.list);
  router.get('/:id', validate({ params: idParamSchema }), controller.getById);
  router.patch(
    '/:id',
    validate({ params: idParamSchema, body: updateSeriesSchema }),
    controller.update
  );
  router.delete('/:id', validate({ params: idParamSchema }), controller.remove);

  return router;
}
