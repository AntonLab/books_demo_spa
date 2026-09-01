import { Router } from 'express';
import type { UserRepository } from '../repositories/userRepository.ts';
import { createUserRoutes } from './userRoutes.ts';

export interface RouteDeps {
  userRepository: UserRepository;
}

export function createApiRouter(deps: RouteDeps): Router {
  const router = Router();
  router.use('/users', createUserRoutes(deps.userRepository));
  return router;
}
