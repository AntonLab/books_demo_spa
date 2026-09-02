import cookieParser from 'cookie-parser';
import express, { type Express } from 'express';
import { errorHandler } from './middleware/errorHandler.ts';
import { notFound } from './middleware/notFound.ts';
import type { BookRepository } from './repositories/bookRepository.ts';
import type { ChapterRepository } from './repositories/chapterRepository.ts';
import type { LikeRepository } from './repositories/likeRepository.ts';
import type { SeriesRepository } from './repositories/seriesRepository.ts';
import type { UserRepository } from './repositories/userRepository.ts';
import { createApiRouter } from './routes/index.ts';

export interface AppDeps {
  userRepository: UserRepository;
  seriesRepository: SeriesRepository;
  bookRepository: BookRepository;
  chapterRepository: ChapterRepository;
  likeRepository: LikeRepository;
}

// No listen() here: tests bind an ephemeral port themselves.
export function createApp(deps: AppDeps): Express {
  const app = express();

  app.use(express.json());
  // Express 5 can set cookies but not read them; requireAuth needs req.cookies.
  app.use(cookieParser());
  app.use('/api', createApiRouter(deps));
  app.use(notFound);
  // Must stay last, after every route and middleware.
  app.use(errorHandler);

  return app;
}
