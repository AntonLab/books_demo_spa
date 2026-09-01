import { Router } from 'express';
import type { SeriesRepository } from '../repositories/seriesRepository.ts';
import type { UserRepository } from '../repositories/userRepository.ts';
import { createSeriesRoutes } from './seriesRoutes.ts';
import { createUserRoutes } from './userRoutes.ts';

export interface RouteDeps {
  userRepository: UserRepository;
  seriesRepository: SeriesRepository;
}

export function createApiRouter(deps: RouteDeps): Router {
  const router = Router();
  router.use('/users', createUserRoutes(deps.userRepository));
  router.use('/series', createSeriesRoutes(deps.seriesRepository));
  return router;
}
