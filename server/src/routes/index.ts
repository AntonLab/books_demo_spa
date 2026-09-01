import { Router } from 'express';
import type { BookRepository } from '../repositories/bookRepository.ts';
import type { ChapterRepository } from '../repositories/chapterRepository.ts';
import type { SeriesRepository } from '../repositories/seriesRepository.ts';
import type { UserRepository } from '../repositories/userRepository.ts';
import { createBookRoutes } from './bookRoutes.ts';
import { createChapterRoutes } from './chapterRoutes.ts';
import { createSeriesRoutes } from './seriesRoutes.ts';
import { createUserRoutes } from './userRoutes.ts';

export interface RouteDeps {
  userRepository: UserRepository;
  seriesRepository: SeriesRepository;
  bookRepository: BookRepository;
  chapterRepository: ChapterRepository;
}

export function createApiRouter(deps: RouteDeps): Router {
  const router = Router();
  router.use('/users', createUserRoutes(deps.userRepository));
  router.use('/series', createSeriesRoutes(deps.seriesRepository));
  router.use('/books', createBookRoutes(deps.bookRepository));
  router.use('/chapters', createChapterRoutes(deps.chapterRepository));
  return router;
}
