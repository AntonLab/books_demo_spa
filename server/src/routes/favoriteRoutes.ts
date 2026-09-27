import { Router } from 'express';
import { createFavoriteController } from '../controllers/favoriteController.ts';
import { createRequireAuth } from '../middleware/requireAuth.ts';
import { createRequirePermission } from '../middleware/requirePermission.ts';
import { validate } from '../middleware/validate.ts';
import {
  createFavoriteSchema,
  listFavoritesQuerySchema,
} from '../types/favorite.ts';
import { idParamSchema } from '../types/params.ts';
import type { RouteDeps } from './index.ts';

// The writes go through the matrix, where every signed-in role holds `own`
// and a Guest nothing (a 401). The lists sit behind requireAuth instead, like
// /api/notifications: an account's own favorites are not a resource one role
// may read and another may not, so no role has `read` on the module.
export function createFavoriteRoutes(deps: RouteDeps): Router {
  const controller = createFavoriteController(deps.favoriteRepository);
  const requirePermission = createRequirePermission(deps);
  const requireAuth = createRequireAuth(deps);
  const router = Router();

  router.get(
    '/books',
    requireAuth,
    validate({ query: listFavoritesQuerySchema }),
    controller.listBooks
  );
  router.get(
    '/series',
    requireAuth,
    validate({ query: listFavoritesQuerySchema }),
    controller.listSeries
  );

  router.post(
    '/',
    requirePermission('favorites', 'create'),
    validate({ body: createFavoriteSchema }),
    controller.create
  );
  router.delete(
    '/:id',
    requirePermission('favorites', 'delete'),
    validate({ params: idParamSchema }),
    controller.remove
  );

  return router;
}
