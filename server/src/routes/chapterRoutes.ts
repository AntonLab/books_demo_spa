import express, { Router } from 'express';
import { ACCEPTED_IMAGE_CONTENT_TYPES, IMAGE_MAX_BYTES } from 'shared';
import { createChapterController } from '../controllers/chapterController.ts';
import { createIllustrationController } from '../controllers/illustrationController.ts';
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
  const illustrations = createIllustrationController(
    deps.illustrationRepository
  );
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
  router.get(
    '/:id/illustrations',
    requirePermission('chapters', 'read'),
    validate({ params: idParamSchema }),
    illustrations.list
  );

  router.post(
    '/',
    requirePermission('chapters', 'create'),
    validate({ body: createChapterSchema }),
    controller.create
  );
  // Raw parser last, so a refused request's 2 MiB is never read.
  router.post(
    '/:id/illustrations',
    requirePermission('chapters', 'update'),
    validate({ params: idParamSchema }),
    express.raw({
      type: [...ACCEPTED_IMAGE_CONTENT_TYPES],
      limit: IMAGE_MAX_BYTES,
    }),
    illustrations.upload
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
