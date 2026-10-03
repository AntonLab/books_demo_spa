import { Router } from 'express';
import { createReportController } from '../controllers/reportController.ts';
import { createRequireAuth } from '../middleware/requireAuth.ts';
import { validate } from '../middleware/validate.ts';
import { idParamSchema } from '../types/params.ts';
import { createReportSchema } from '../types/report.ts';
import type { RouteDeps } from './index.ts';

// requireAuth rather than the matrix: any signed-in Account may report.
export function createCommentReportRoutes(deps: RouteDeps): Router {
  const controller = createReportController(deps.reportRepository);
  const requireAuth = createRequireAuth(deps);
  const router = Router();

  router.post(
    '/:id/report',
    requireAuth,
    validate({ params: idParamSchema, body: createReportSchema }),
    controller.create
  );
  return router;
}

// Task 10 fills this and mounts it on /reports.
export function createReportRoutes(_deps: RouteDeps): Router {
  return Router();
}
