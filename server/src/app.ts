import cookieParser from 'cookie-parser';
import express, { type Express } from 'express';
import type { ResetDelivery } from './delivery/resetDelivery.ts';
import type { AuthRateLimits } from './middleware/authRateLimit.ts';
import {
  createCrossOriginProtection,
  requireXsrfToken,
} from './middleware/csrfProtection.ts';
import { errorHandler } from './middleware/errorHandler.ts';
import { notFound } from './middleware/notFound.ts';
import { noSniff } from './middleware/securityHeaders.ts';
import type { BookRepository } from './repositories/bookRepository.ts';
import type { ChapterRepository } from './repositories/chapterRepository.ts';
import type { CommentRepository } from './repositories/commentRepository.ts';
import type { GenreRepository } from './repositories/genreRepository.ts';
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
  genreRepository: GenreRepository;
  commentRepository: CommentRepository;
  likeRepository: LikeRepository;
  notificationRepository: NotificationRepository;
  sessionRepository: SessionRepository;
  passwordResetRepository: PasswordResetRepository;
  resetDelivery: ResetDelivery;
  // The client's origin (APP_BASE_URL): the one foreign origin a write may
  // come from. See middleware/csrfProtection.ts.
  trustedOrigin: string;
  // TRUST_PROXY: how many proxy hops in front of the API may name the client
  // in X-Forwarded-For. Governs req.ip.
  trustProxy: number;
  // The sign-in rate limits (middleware/authRateLimit.ts). Required, so no
  // app is ever built without them by accident; tests pass
  // unlimitedAuthRateLimits() from the route test kit.
  authRateLimits: AuthRateLimits;
}

// No listen() here: tests bind an ephemeral port themselves.
export function createApp(deps: AppDeps): Express {
  const app = express();

  // Before anything reads req.ip: whether X-Forwarded-For names the client.
  // Express treats 0 as trusting no proxy.
  app.set('trust proxy', deps.trustProxy);

  // Names no framework to whoever is probing.
  app.disable('x-powered-by');
  // First, so every response carries it: a success, a 404, an error, and a
  // body express.json() refuses to parse.
  app.use(noSniff);

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
