import { Router } from 'express';
import { createChapterController } from '../controllers/chapterController.ts';
import { createRequirePermission } from '../middleware/requirePermission.ts';
import { validate } from '../middleware/validate.ts';
import {
  createChapterSchema,
  listChaptersQuerySchema,
  updateChapterSchema,
} from '../types/chapter.ts';
import { idParamSchema } from '../types/params.ts';
import type { RouteDeps } from './index.ts';

export function createChapterRoutes(deps: RouteDeps): Router {
  const controller = createChapterController(deps.chapterRepository);
  const requirePermission = createRequirePermission(deps);
  const router = Router();

  // Every route runs through the matrix, reads included: every role has
  // `read: any` on chapters, which is what keeps the list and detail routes
  // public.
  router.get(
    '/',
    requirePermission('chapters', 'read'),
    validate({ query: listChaptersQuerySchema }),
    controller.list
  );
  router.get(
    '/:id',
    requirePermission('chapters', 'read'),
    validate({ params: idParamSchema }),
    controller.getById
  );

  router.post(
    '/',
    requirePermission('chapters', 'create'),
    validate({ body: createChapterSchema }),
    controller.create
  );
  router.patch(
    '/:id',
    requirePermission('chapters', 'update'),
    validate({ params: idParamSchema, body: updateChapterSchema }),
    controller.update
  );
  router.delete(
    '/:id',
    requirePermission('chapters', 'delete'),
    validate({ params: idParamSchema }),
    controller.remove
  );

  return router;
}
