import { Router } from 'express';
import { createAccountController } from '../controllers/accountController.ts';
import { validate } from '../middleware/validate.ts';
import { idParamSchema } from '../types/params.ts';
import type { RouteDeps } from './index.ts';

export function createAccountRoutes(deps: RouteDeps): Router {
  const controller = createAccountController(deps);
  const router = Router();

  // Deliberately no requirePermission here — a profile is public. The
  // repository answers null for an account that is Blocked or Pending.
  router.get(
    '/:id',
    validate({ params: idParamSchema }),
    controller.getProfile
  );

  return router;
}
