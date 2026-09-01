import { Router } from 'express';
import { createChapterController } from '../controllers/chapterController.ts';
import { validate } from '../middleware/validate.ts';
import type { ChapterRepository } from '../repositories/chapterRepository.ts';
import {
  createChapterSchema,
  idParamSchema,
  listChaptersQuerySchema,
  updateChapterSchema,
} from '../types/chapter.ts';

export function createChapterRoutes(repository: ChapterRepository): Router {
  const controller = createChapterController(repository);
  const router = Router();

  router.post('/', validate({ body: createChapterSchema }), controller.create);
  router.get(
    '/',
    validate({ query: listChaptersQuerySchema }),
    controller.list
  );
  router.get('/:id', validate({ params: idParamSchema }), controller.getById);
  router.patch(
    '/:id',
    validate({ params: idParamSchema, body: updateChapterSchema }),
    controller.update
  );
  router.delete('/:id', validate({ params: idParamSchema }), controller.remove);

  return router;
}
