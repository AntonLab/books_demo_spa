import { Router } from 'express';
import { createIllustrationController } from '../controllers/illustrationController.ts';
import { createRequirePermission } from '../middleware/requirePermission.ts';
import { validate } from '../middleware/validate.ts';
import { idParamSchema } from '../types/params.ts';
import type { RouteDeps } from './index.ts';

export function createIllustrationRoutes(deps: RouteDeps): Router {
  const controller = createIllustrationController(deps.illustrationRepository);
  const requirePermission = createRequirePermission(deps);
  const router = Router();

  router.get(
    '/:id/image',
    requirePermission('chapters', 'read'),
    validate({ params: idParamSchema }),
    controller.getImage
  );

  return router;
}
