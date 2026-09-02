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
  router.use('/auth', createAuthRoutes(deps));
  router.use('/users', createUserRoutes(deps.userRepository));
  router.use('/series', createSeriesRoutes(deps.seriesRepository));
  router.use('/books', createBookRoutes(deps.bookRepository));
  router.use('/chapters', createChapterRoutes(deps.chapterRepository));
  router.use('/likes', createLikeRoutes(deps.likeRepository));
  return router;
}
