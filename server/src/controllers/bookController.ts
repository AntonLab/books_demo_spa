import type { Request, RequestHandler } from 'express';
import {
  validatedBody,
  validatedParams,
  validatedQuery,
} from '../middleware/validate.ts';
import type { BookRepository } from '../repositories/bookRepository.ts';
import {
  ForbiddenError,
  NotFoundError,
  UnauthorizedError,
} from '../types/errors.ts';
import type {
  CreateBookInput,
  ListBooksQuery,
  UpdateBookInput,
} from '../types/book.ts';

export interface BookController {
  create: RequestHandler;
  list: RequestHandler;
  getById: RequestHandler;
  update: RequestHandler;
  remove: RequestHandler;
}

// No try/catch anywhere below: the Express 5 router inspects the returned
// promise and calls next(err) itself when it rejects.
export function createBookController(
  repository: BookRepository
): BookController {
  // The other half of enforcement. requirePermission already refused `none`;
  // `any` needs nothing more, and `own` is the only case that has to look at
  // the row — which is why this cannot live in the middleware, where the row
  // is not loaded yet.
  //
  // Only `any` returns early. Every other value, a missing scope included,
  // falls through to the owner comparison: a handler mounted without
  // requirePermission fails closed rather than acting as `any`.
  //
  // 404 before 403, so a refusal cannot be used to probe which ids exist.
  const assertMayTouch = async (req: Request, id: number): Promise<void> => {
    if (req.permissionScope === 'any') return;

    const ownerId = await repository.findOwnerId(id);
    if (ownerId === null) throw new NotFoundError('Book', id);
    if (ownerId !== req.user?.id) {
      throw new ForbiddenError('You may only change your own books');
    }
  };

  // Filing a book under a series changes that series too — it starts listing
  // the book — so the target series' owner has to answer as well as the
  // book's. Without this an author could put their book into a stranger's
  // series, and the series' owner could only undo it by deleting the series.
  // chapterController.assertMayAddTo closes the same hole one level down.
  //
  // null (unlinking) and an absent key (leaving the link alone) touch no
  // series, so neither needs a check. An absent series is still a 404 that
  // blames the series, and it comes before the 403, as everywhere else.
  const assertMayAddToSeries = async (
    req: Request,
    seriesId: number | null | undefined
  ): Promise<void> => {
    if (seriesId === null || seriesId === undefined) return;
    if (req.permissionScope === 'any') return;

    const ownerId = await repository.findSeriesOwnerId(seriesId);
    if (ownerId === null) throw new NotFoundError('Series', seriesId);
    if (ownerId !== req.user?.id) {
      throw new ForbiddenError('You may only add books to your own series');
    }
  };

  return {
    create: async (req, res) => {
      if (!req.user) throw new UnauthorizedError();

      const input = validatedBody<CreateBookInput>(req);
      await assertMayAddToSeries(req, input.seriesId);

      // The owner comes from the session, never the body — otherwise an author
      // could create a book owned by someone else and the ownership rule above
      // would mean nothing.
      const book = await repository.create({ ...input, userId: req.user.id });
      res.status(201).json(book);
    },

    list: async (req, res) => {
      const query = validatedQuery<ListBooksQuery>(req);
      const { items, total } = await repository.list(query);
      res.json({ items, total, limit: query.limit, offset: query.offset });
    },

    getById: async (req, res) => {
      const { id } = validatedParams<{ id: number }>(req);
      // optionalAuth fills req.user when a session cookie resolves and leaves
      // it unset otherwise; the repository takes null for "anonymous", which is
      // what makes viewerLikeId come back empty.
      const book = await repository.findDetailById(id, req.user?.id ?? null);
      if (!book) throw new NotFoundError('Book', id);
      res.json(book);
    },

    update: async (req, res) => {
      const { id } = validatedParams<{ id: number }>(req);
      const input = validatedBody<UpdateBookInput>(req);
      // The book first: a caller who may not touch it learns nothing about
      // the series they named.
      await assertMayTouch(req, id);
      await assertMayAddToSeries(req, input.seriesId);

      const book = await repository.update(id, input);
      if (!book) throw new NotFoundError('Book', id);
      res.json(book);
    },

    remove: async (req, res) => {
      const { id } = validatedParams<{ id: number }>(req);
      await assertMayTouch(req, id);

      const deleted = await repository.remove(id);
      if (!deleted) throw new NotFoundError('Book', id);
      res.status(204).end();
    },
  };
}
