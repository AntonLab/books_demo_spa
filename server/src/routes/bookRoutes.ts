import express, { Router } from 'express';
import { createBookController } from '../controllers/bookController.ts';
import { createRequireAuth } from '../middleware/requireAuth.ts';
import { createRequirePermission } from '../middleware/requirePermission.ts';
import { validate } from '../middleware/validate.ts';
import {
  createBookSchema,
  listBooksQuerySchema,
  updateBookSchema,
} from '../types/book.ts';
import {
  addCoAuthorSchema,
  coAuthorParamSchema,
  idParamSchema,
} from '../types/params.ts';
import {
  ACCEPTED_IMAGE_CONTENT_TYPES,
  IMAGE_MAX_BYTES,
} from '../types/image.ts';
import type { RouteDeps } from './index.ts';

export function createBookRoutes(deps: RouteDeps): Router {
  const controller = createBookController(deps.bookRepository);
  const requirePermission = createRequirePermission(deps);
  const requireAuth = createRequireAuth(deps);
  const router = Router();

  // Every route runs through the matrix, reads included: `guest` has `read:
  // any` on books, which is what keeps the list and detail routes public.
  router.get(
    '/',
    requirePermission('books', 'read'),
    validate({ query: listBooksQuerySchema }),
    controller.list
  );
  // No separate optionalAuth: requirePermission resolves the session itself
  // and sets req.user whenever one exists, so the detail handler still fills
  // in viewerLikeId for a signed-in caller.
  router.get(
    '/:id',
    requirePermission('books', 'read'),
    validate({ params: idParamSchema }),
    controller.getById
  );

  // requirePermission goes before validate on every write, so a refused
  // request is never parsed or echoed back in a 400.
  router.post(
    '/',
    requirePermission('books', 'create'),
    validate({ body: createBookSchema }),
    controller.create
  );
  router.patch(
    '/:id',
    requirePermission('books', 'update'),
    validate({ params: idParamSchema, body: updateBookSchema }),
    controller.update
  );
  router.delete(
    '/:id',
    requirePermission('books', 'delete'),
    validate({ params: idParamSchema }),
    controller.remove
  );

  // Crediting a co-author changes the book, so it rides on `books × update`;
  // the controller then refuses a Moderator, whose `any` reaches every book
  // but not its byline.
  router.post(
    '/:id/co-authors',
    requirePermission('books', 'update'),
    validate({ params: idParamSchema, body: addCoAuthorSchema }),
    controller.addCoAuthor
  );
  // Not requirePermission: leaving a book must not depend on a books grant,
  // because a Co-author who switched Role to `user` holds `none` there and
  // would otherwise be stuck on the byline. Any session gets through; the
  // controller decides who may remove whom.
  router.delete(
    '/:id/co-authors/:userId',
    requireAuth,
    validate({ params: coAuthorParamSchema }),
    controller.removeCoAuthor
  );

  // A1/A2: the raw body parser is mounted on this PUT alone, never
  // app-wide, and after requirePermission so a refused request's 2 MiB is
  // never read.
  router.put(
    '/:id/cover',
    requirePermission('books', 'update'),
    validate({ params: idParamSchema }),
    express.raw({
      type: [...ACCEPTED_IMAGE_CONTENT_TYPES],
      limit: IMAGE_MAX_BYTES,
    }),
    controller.uploadCover
  );
  router.delete(
    '/:id/cover',
    requirePermission('books', 'update'),
    validate({ params: idParamSchema }),
    controller.removeCover
  );
  // A3: books x read, which a guest holds — the same public-read pattern as
  // GET /:id.
  router.get(
    '/:id/cover',
    requirePermission('books', 'read'),
    validate({ params: idParamSchema }),
    controller.getCover
  );

  return router;
}
