import { Router } from 'express';
import { createAuthController } from '../controllers/authController.ts';
import { createRequireAuth } from '../middleware/requireAuth.ts';
import { validate } from '../middleware/validate.ts';
import {
  loginSchema,
  registerSchema,
  resetConfirmSchema,
  resetRequestSchema,
} from '../types/auth.ts';
import type { RouteDeps } from './index.ts';

export function createAuthRoutes(deps: RouteDeps): Router {
  const controller = createAuthController(deps);
  const requireAuth = createRequireAuth(deps);
  const router = Router();

  router.post(
    '/register',
    validate({ body: registerSchema }),
    controller.register
  );
  router.post('/login', validate({ body: loginSchema }), controller.login);
  // No requireAuth: logging out with an already-dead session is a success.
  router.post('/logout', controller.logout);
  router.get('/me', requireAuth, controller.me);
  router.post(
    '/password-reset/request',
    validate({ body: resetRequestSchema }),
    controller.requestReset
  );
  router.post(
    '/password-reset/confirm',
    validate({ body: resetConfirmSchema }),
    controller.confirmReset
  );

  return router;
}
