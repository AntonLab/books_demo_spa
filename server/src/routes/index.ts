import { Router } from 'express';
import type { ResetDelivery } from '../delivery/resetDelivery.ts';
import type { BookRepository } from '../repositories/bookRepository.ts';
import type { ChapterRepository } from '../repositories/chapterRepository.ts';
import type { LikeRepository } from '../repositories/likeRepository.ts';
import type { PasswordResetRepository } from '../repositories/passwordResetRepository.ts';
import type { SeriesRepository } from '../repositories/seriesRepository.ts';
import type { SessionRepository } from '../repositories/sessionRepository.ts';
import type { UserRepository } from '../repositories/userRepository.ts';
import { createAuthRoutes } from './authRoutes.ts';
import { createBookRoutes } from './bookRoutes.ts';
import { createChapterRoutes } from './chapterRoutes.ts';
import { createLikeRoutes } from './likeRoutes.ts';
import { createSeriesRoutes } from './seriesRoutes.ts';
import { createUserRoutes } from './userRoutes.ts';

export interface RouteDeps {
  userRepository: UserRepository;
  seriesRepository: SeriesRepository;
  bookRepository: BookRepository;
  chapterRepository: ChapterRepository;
  likeRepository: LikeRepository;
  sessionRepository: SessionRepository;
  passwordResetRepository: PasswordResetRepository;
  resetDelivery: ResetDelivery;
}

export function createApiRouter(deps: RouteDeps): Router {
  const router = Router();
  // Every factory takes the whole RouteDeps rather than its own repository:
  // each one builds a requireAuth, which needs the session and user
  // repositories alongside the resource's own.
  router.use('/auth', createAuthRoutes(deps));
  router.use('/users', createUserRoutes(deps));
  router.use('/series', createSeriesRoutes(deps));
  router.use('/books', createBookRoutes(deps));
  router.use('/chapters', createChapterRoutes(deps));
  router.use('/likes', createLikeRoutes(deps));
  return router;
}
