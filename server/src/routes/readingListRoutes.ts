import { Router } from 'express';
import { createReadingListController } from '../controllers/readingListController.ts';
import { createRequireAuth } from '../middleware/requireAuth.ts';
import { validate } from '../middleware/validate.ts';
import { idParamSchema } from '../types/params.ts';
import {
  addReadingListItemSchema,
  createReadingListSchema,
  listReadingListsQuerySchema,
  myReadingListsQuerySchema,
  readingListItemParamSchema,
  reorderReadingListItemsSchema,
  updateReadingListSchema,
} from '../types/readingList.ts';
import type { RouteDeps } from './index.ts';

// requireAuth rather than the matrix: a list is its owner's, so no role holds
// a permission on it. Reads of a list by id are public.
export function createReadingListRoutes(deps: RouteDeps): Router {
  const controller = createReadingListController(deps.readingListRepository);
  const requireAuth = createRequireAuth(deps);
  const router = Router();

  router.get(
    '/',
    validate({ query: listReadingListsQuerySchema }),
    controller.list
  );
  // Before /:id, which would read "mine" as an id.
  router.get(
    '/mine',
    requireAuth,
    validate({ query: myReadingListsQuerySchema }),
    controller.mine
  );
  router.get('/:id', validate({ params: idParamSchema }), controller.get);
  router.get(
    '/:id/items',
    requireAuth,
    validate({ params: idParamSchema }),
    controller.editItems
  );
  router.post(
    '/',
    requireAuth,
    validate({ body: createReadingListSchema }),
    controller.create
  );
  router.patch(
    '/:id',
    requireAuth,
    validate({ params: idParamSchema, body: updateReadingListSchema }),
    controller.update
  );
  router.delete(
    '/:id',
    requireAuth,
    validate({ params: idParamSchema }),
    controller.remove
  );
  router.post(
    '/:id/items',
    requireAuth,
    validate({ params: idParamSchema, body: addReadingListItemSchema }),
    controller.addItem
  );
  router.delete(
    '/:id/items/:itemId',
    requireAuth,
    validate({ params: readingListItemParamSchema }),
    controller.removeItem
  );
  router.put(
    '/:id/item-order',
    requireAuth,
    validate({ params: idParamSchema, body: reorderReadingListItemsSchema }),
    controller.reorderItems
  );
  router.post(
    '/:id/copy',
    requireAuth,
    validate({ params: idParamSchema }),
    controller.copy
  );

  return router;
}
