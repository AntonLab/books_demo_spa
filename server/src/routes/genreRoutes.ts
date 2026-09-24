import { Router } from 'express';
import { createGenreController } from '../controllers/genreController.ts';
import { createRequirePermission } from '../middleware/requirePermission.ts';
import { validate } from '../middleware/validate.ts';
import { genreBodySchema, listGenresQuerySchema } from '../types/genre.ts';
import { idParamSchema } from '../types/params.ts';
import type { RouteDeps } from './index.ts';

export function createGenreRoutes(deps: RouteDeps): Router {
  const controller = createGenreController(deps.genreRepository);
  const requirePermission = createRequirePermission(deps);
  const router = Router();

  // Every route runs through the matrix, the read included: `guest` has
  // `read: any` on genres, which is what keeps this list public (A1).
  router.get(
    '/',
    requirePermission('genres', 'read'),
    validate({ query: listGenresQuerySchema }),
    controller.list
  );

  // requirePermission goes before validate on every write, so a refused
  // request is never parsed or echoed back in a 400.
  router.post(
    '/',
    requirePermission('genres', 'create'),
    validate({ body: genreBodySchema }),
    controller.create
  );
  router.patch(
    '/:id',
    requirePermission('genres', 'update'),
    validate({ params: idParamSchema, body: genreBodySchema }),
    controller.update
  );
  router.delete(
    '/:id',
    requirePermission('genres', 'delete'),
    validate({ params: idParamSchema }),
    controller.remove
  );

  return router;
}
