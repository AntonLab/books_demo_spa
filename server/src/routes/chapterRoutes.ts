import { Router } from 'express';
import { createChapterController } from '../controllers/chapterController.ts';
import { createRequireAuth } from '../middleware/requireAuth.ts';
import { validate } from '../middleware/validate.ts';
import {
  createChapterSchema,
  idParamSchema,
  listChaptersQuerySchema,
  updateChapterSchema,
} from '../types/chapter.ts';
import type { RouteDeps } from './index.ts';

export function createChapterRoutes(deps: RouteDeps): Router {
  const controller = createChapterController(deps.chapterRepository);
  const requireAuth = createRequireAuth(deps);
  const router = Router();

  // Reads stay public: the client's book list must work logged out.
  router.get(
    '/',
    validate({ query: listChaptersQuerySchema }),
    controller.list
  );
  router.get('/:id', validate({ params: idParamSchema }), controller.getById);

  // requireAuth goes before validate on every write, so an unauthenticated
  // request is refused without its body being parsed or echoed back in a 400.
  router.post(
    '/',
    requireAuth,
    validate({ body: createChapterSchema }),
    controller.create
  );
  router.patch(
    '/:id',
    requireAuth,
    validate({ params: idParamSchema, body: updateChapterSchema }),
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
