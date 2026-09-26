import { Router } from 'express';
import type { MailDelivery } from '../delivery/mailDelivery.ts';
import type { AuthRateLimits } from '../middleware/authRateLimit.ts';
import type { Repositories } from '../repositories/sequelizeRepositories.ts';
import { createAuthorRoutes } from './authorRoutes.ts';
import { createAuthRoutes } from './authRoutes.ts';
import { createBookRoutes } from './bookRoutes.ts';
import { createChapterRoutes } from './chapterRoutes.ts';
import { createCommentRoutes } from './commentRoutes.ts';
import { createFavoriteRoutes } from './favoriteRoutes.ts';
import { createGenreRoutes } from './genreRoutes.ts';
import { createLikeRoutes } from './likeRoutes.ts';
import { createNotificationRoutes } from './notificationRoutes.ts';
import { createSeriesRoutes } from './seriesRoutes.ts';
import { createUserRoutes } from './userRoutes.ts';

export interface RouteDeps extends Repositories {
  mailDelivery: MailDelivery;
  // APP_BASE_URL: the client origin every emailed link is built on.
  appBaseUrl: string;
  // The sign-in rate limits (middleware/authRateLimit.ts). Required, so no
  // app is ever built without them by accident; tests pass
  // unlimitedAuthRateLimits() from the route test kit.
  authRateLimits: AuthRateLimits;
}

export function createApiRouter(deps: RouteDeps): Router {
  const router = Router();
  // Every factory takes the whole RouteDeps rather than its own repository:
  // each one builds a requirePermission (authRoutes a requireAuth), which
  // needs the session and user repositories alongside the resource's own.
  router.use('/auth', createAuthRoutes(deps));
  router.use('/authors', createAuthorRoutes(deps));
  router.use('/users', createUserRoutes(deps));
  router.use('/series', createSeriesRoutes(deps));
  router.use('/books', createBookRoutes(deps));
  router.use('/chapters', createChapterRoutes(deps));
  // Reference data for the catalogue: no path here collides with any above.
  router.use('/genres', createGenreRoutes(deps));
  router.use('/comments', createCommentRoutes(deps));
  router.use('/likes', createLikeRoutes(deps));
  router.use('/favorites', createFavoriteRoutes(deps));
  router.use('/notifications', createNotificationRoutes(deps));
  return router;
}
