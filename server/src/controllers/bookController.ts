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
  // 404 before 403, so a refusal cannot be used to probe which ids exist.
  const assertMayTouch = async (req: Request, id: number): Promise<void> => {
    if (req.permissionScope !== 'own') return;

    const ownerId = await repository.findOwnerId(id);
    if (ownerId === null) throw new NotFoundError('Book', id);
    if (ownerId !== req.user?.id) {
      throw new ForbiddenError('You may only change your own books');
    }
  };

  return {
    create: async (req, res) => {
      if (!req.user) throw new UnauthorizedError();

      // The owner comes from the session, never the body — otherwise an author
      // could create a book owned by someone else and the ownership rule above
      // would mean nothing.
      const book = await repository.create({
        ...validatedBody<CreateBookInput>(req),
        userId: req.user.id,
      });
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
      await assertMayTouch(req, id);

      const book = await repository.update(
        id,
        validatedBody<UpdateBookInput>(req)
      );
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
