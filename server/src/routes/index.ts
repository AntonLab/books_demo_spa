import { Router } from 'express';
import type { ResetDelivery } from '../delivery/resetDelivery.ts';
import type { AuthRateLimits } from '../middleware/authRateLimit.ts';
import type { BookRepository } from '../repositories/bookRepository.ts';
import type { ChapterRepository } from '../repositories/chapterRepository.ts';
import type { CommentRepository } from '../repositories/commentRepository.ts';
import type { GenreRepository } from '../repositories/genreRepository.ts';
import type { LikeRepository } from '../repositories/likeRepository.ts';
import type { NotificationRepository } from '../repositories/notificationRepository.ts';
import type { PasswordResetRepository } from '../repositories/passwordResetRepository.ts';
import type { SeriesRepository } from '../repositories/seriesRepository.ts';
import type { SessionRepository } from '../repositories/sessionRepository.ts';
import type { UserRepository } from '../repositories/userRepository.ts';
import { createAuthorRoutes } from './authorRoutes.ts';
import { createAuthRoutes } from './authRoutes.ts';
import { createBookRoutes } from './bookRoutes.ts';
import { createChapterOrderRoutes } from './chapterOrderRoutes.ts';
import { createChapterRoutes } from './chapterRoutes.ts';
import { createCommentRoutes } from './commentRoutes.ts';
import { createGenreRoutes } from './genreRoutes.ts';
import { createLikeRoutes } from './likeRoutes.ts';
import { createNotificationRoutes } from './notificationRoutes.ts';
import { createSeriesBookRoutes } from './seriesBookRoutes.ts';
import { createSeriesRoutes } from './seriesRoutes.ts';
import { createUserRoleRoutes } from './userRoleRoutes.ts';
import { createUserRoutes } from './userRoutes.ts';

export interface RouteDeps {
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
  authRateLimits: AuthRateLimits;
}

export function createApiRouter(deps: RouteDeps): Router {
  const router = Router();
  // Every factory takes the whole RouteDeps rather than its own repository:
  // each one builds a requirePermission (authRoutes a requireAuth), which
  // needs the session and user repositories alongside the resource's own.
  router.use('/auth', createAuthRoutes(deps));
  // The role routes mount first for readability — the narrower path reads
  // first. The order is not load-bearing: `/:id` matches exactly one path
  // segment, so it can never match `/:id/role`, and the two routers do not
  // collide whichever is mounted first.
  router.use('/authors', createAuthorRoutes(deps));
  router.use('/users', createUserRoleRoutes(deps));
  router.use('/users', createUserRoutes(deps));
  // Neither path collides with seriesRoutes': GET /:id/books and
  // PUT /:id/book-order are routes it does not have.
  router.use('/series', createSeriesBookRoutes(deps));
  router.use('/series', createSeriesRoutes(deps));
  // Like the role routes: `/:id` never matches `/:id/chapter-order`, so the
  // order of these two is not load-bearing either.
  router.use('/books', createChapterOrderRoutes(deps));
  router.use('/books', createBookRoutes(deps));
  router.use('/chapters', createChapterRoutes(deps));
  // Reference data for the catalogue: no path here collides with any above.
  router.use('/genres', createGenreRoutes(deps));
  router.use('/comments', createCommentRoutes(deps));
  router.use('/likes', createLikeRoutes(deps));
  router.use('/notifications', createNotificationRoutes(deps));
  return router;
}
