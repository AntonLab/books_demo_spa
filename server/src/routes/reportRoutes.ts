import { Router } from 'express';
import { createReportController } from '../controllers/reportController.ts';
import { createRequireAuth } from '../middleware/requireAuth.ts';
import { createRequireModerator } from '../middleware/requireModerator.ts';
import { validate } from '../middleware/validate.ts';
import { idParamSchema } from '../types/params.ts';
import {
  commentIdParamSchema,
  createReportSchema,
  listReportsQuerySchema,
  reportRangeSchema,
} from '../types/report.ts';
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

// requireModerator runs before validate, so a non-Moderator never sees a 400.
export function createReportRoutes(deps: RouteDeps): Router {
  const controller = createReportController(deps.reportRepository);
  const guard = [createRequireAuth(deps), createRequireModerator()];
  const router = Router();

  router.get(
    '/',
    ...guard,
    validate({ query: listReportsQuerySchema }),
    controller.list
  );
  router.get(
    '/statistics',
    ...guard,
    validate({ query: reportRangeSchema }),
    controller.statistics
  );
  for (const action of ['take', 'uphold', 'dismiss'] as const) {
    router.post(
      `/:commentId/${action}`,
      ...guard,
      validate({ params: commentIdParamSchema }),
      controller[action]
    );
  }
  return router;
}
