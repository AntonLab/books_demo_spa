import cookieParser from 'cookie-parser';
import express, { type Express } from 'express';
import type { ResetDelivery } from './delivery/resetDelivery.ts';
import {
  createCrossOriginProtection,
  requireXsrfToken,
} from './middleware/csrfProtection.ts';
import { errorHandler } from './middleware/errorHandler.ts';
import { notFound } from './middleware/notFound.ts';
import type { BookRepository } from './repositories/bookRepository.ts';
import type { ChapterRepository } from './repositories/chapterRepository.ts';
import type { CommentRepository } from './repositories/commentRepository.ts';
import type { LikeRepository } from './repositories/likeRepository.ts';
import type { NotificationRepository } from './repositories/notificationRepository.ts';
import type { PasswordResetRepository } from './repositories/passwordResetRepository.ts';
import type { SeriesRepository } from './repositories/seriesRepository.ts';
import type { SessionRepository } from './repositories/sessionRepository.ts';
import type { UserRepository } from './repositories/userRepository.ts';
import { createApiRouter } from './routes/index.ts';

export interface AppDeps {
  userRepository: UserRepository;
  seriesRepository: SeriesRepository;
  bookRepository: BookRepository;
  chapterRepository: ChapterRepository;
  commentRepository: CommentRepository;
  likeRepository: LikeRepository;
  notificationRepository: NotificationRepository;
  sessionRepository: SessionRepository;
  passwordResetRepository: PasswordResetRepository;
  resetDelivery: ResetDelivery;
  // The client's origin (APP_BASE_URL): the one foreign origin a write may
  // come from. See middleware/csrfProtection.ts.
  trustedOrigin: string;
}

// No listen() here: tests bind an ephemeral port themselves.
export function createApp(deps: AppDeps): Express {
  const app = express();

  app.use(express.json());
  // Express 5 can set cookies but not read them; resolveSessionUser, behind
  // both requirePermission and requireAuth, needs req.cookies.
  app.use(cookieParser());
  // Both ahead of every route: a forged write is refused before anything
  // reads its body or its session.
  app.use(createCrossOriginProtection(deps.trustedOrigin));
  app.use(requireXsrfToken);
  app.use('/api', createApiRouter(deps));
  app.use(notFound);
  // Must stay last, after every route and middleware.
  app.use(errorHandler);

  return app;
}
