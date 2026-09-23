import { Router } from 'express';
import { createChapterController } from '../controllers/chapterController.ts';
import { createRequirePermission } from '../middleware/requirePermission.ts';
import { validate } from '../middleware/validate.ts';
import { reorderChaptersSchema } from '../types/chapter.ts';
import { idParamSchema } from '../types/params.ts';
import type { RouteDeps } from './index.ts';

// A book's Reading order, mounted under /books because the order belongs to
// the book as a whole, but handled by the chapter controller: it is a change
// to the book's chapters and takes exactly the permission editing them does.
export function createChapterOrderRoutes(deps: RouteDeps): Router {
  const controller = createChapterController(deps.chapterRepository);
  const requirePermission = createRequirePermission(deps);
  const router = Router();

  router.put(
    '/:id/chapter-order',
    requirePermission('chapters', 'update'),
    validate({ params: idParamSchema, body: reorderChaptersSchema }),
    controller.reorder
  );

  return router;
}
