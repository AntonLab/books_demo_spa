import type { Request, RequestHandler } from 'express';
import {
  validatedBody,
  validatedParams,
  validatedQuery,
} from '../middleware/validate.ts';
import { scopeFor } from '../permissions/permissionStore.ts';
import type { SeriesRepository } from '../repositories/seriesRepository.ts';
import { actorOf, viewerOf } from '../repositories/visibility.ts';
import {
  ForbiddenError,
  NotFoundError,
  UnauthorizedError,
} from '../types/errors.ts';
import type {
  CreateSeriesInput,
  ListSeriesQuery,
  UpdateSeriesInput,
} from '../types/series.ts';
import type { AddCoAuthorInput } from '../types/params.ts';

// No try/catch anywhere below: the Express 5 router inspects the returned
// promise and calls next(err) itself when it rejects.
export function createSeriesController(repository: SeriesRepository) {
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
  //
  // `own` means "one of the series' Co-authors" (ADR-0005), as on a book.
  const assertCoAuthor = async (req: Request, id: number): Promise<void> => {
    const coAuthorIds = await repository.findCoAuthorIds(id);
    if (coAuthorIds === null) throw new NotFoundError('Series', id);
    if (req.user === undefined || !coAuthorIds.includes(req.user.id)) {
      throw new ForbiddenError('You may only change series you co-author');
    }
  };

  const assertMayTouch = async (req: Request, id: number): Promise<void> => {
    if (req.permissionScope === 'any') return;
    await assertCoAuthor(req, id);
  };

  return {
    create: async (req, res) => {
      if (!req.user) throw new UnauthorizedError();

      // The first Co-author comes from the session, never the body —
      // otherwise an author could create a series credited to someone else
      // and the co-author rule above would mean nothing.
      const series = await repository.create({
        ...validatedBody<CreateSeriesInput>(req),
        userId: req.user.id,
      });
      res.status(201).json(series);
    },

    list: async (req, res) => {
      const query = validatedQuery<ListSeriesQuery>(req);
      const { items, total } = await repository.list(query, viewerOf(req.user));
      res.json({ items, total, limit: query.limit, offset: query.offset });
    },

    getById: async (req, res) => {
      const { id } = validatedParams<{ id: number }>(req);
      const series = await repository.findById(id, viewerOf(req.user));
      if (!series) throw new NotFoundError('Series', id);
      res.json(series);
    },

    update: async (req, res) => {
      const { id } = validatedParams<{ id: number }>(req);
      await assertMayTouch(req, id);

      const series = await repository.update(
        id,
        validatedBody<UpdateSeriesInput>(req)
      );
      if (!series) throw new NotFoundError('Series', id);
      res.json(series);
    },

    remove: async (req, res) => {
      const { id } = validatedParams<{ id: number }>(req);
      await assertMayTouch(req, id);

      const deleted = await repository.remove(id, actorOf(req));
      if (!deleted) throw new NotFoundError('Series', id);
      res.status(204).end();
    },

    // Rides on `series × update`, then requires a Co-author: a Moderator's
    // `any` reaches every series but never its byline.
    addCoAuthor: async (req, res) => {
      const { id } = validatedParams<{ id: number }>(req);
      const { userId } = validatedBody<AddCoAuthorInput>(req);
      await assertCoAuthor(req, id);

      const series = await repository.addCoAuthor(id, userId, actorOf(req));
      if (!series) throw new NotFoundError('Series', id);
      res.json(series);
    },

    // Behind requireAuth alone, as on a book: leaving is always allowed to a
    // credited account whatever its Role, and removing someone else takes a
    // Co-author holding exactly `own` on series.
    removeCoAuthor: async (req, res) => {
      if (!req.user) throw new UnauthorizedError();
      const { id, userId } = validatedParams<{ id: number; userId: number }>(
        req
      );

      if (userId !== req.user.id) {
        if (scopeFor(req.user.role, 'series', 'update') !== 'own') {
          throw new ForbiddenError('Only a co-author may remove a co-author');
        }
        await assertCoAuthor(req, id);
      }

      const series = await repository.removeCoAuthor(id, userId, actorOf(req));
      if (!series) throw new NotFoundError('Series', id);
      res.json(series);
    },

    // Taking a book out changes the series, so it is the series that answers:
    // one of its Co-authors, or a Moderator under `any`. The book's own
    // Co-authors leave through PATCH /api/books/:id with `seriesId: null`.
    removeBook: async (req, res) => {
      const { id, bookId } = validatedParams<{ id: number; bookId: number }>(
        req
      );
      await assertMayTouch(req, id);

      const removed = await repository.removeBook(id, bookId);
      if (!removed) throw new NotFoundError('Series', id);
      res.status(204).end();
    },
  } satisfies Record<string, RequestHandler>;
}
