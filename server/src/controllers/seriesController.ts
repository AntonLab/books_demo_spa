import type { RequestHandler } from 'express';
import {
  validatedBody,
  validatedParams,
  validatedQuery,
} from '../middleware/validate.ts';
import { assertMayChange, type CoAuthorTarget } from './coAuthorGuard.ts';
import { creditHandlers } from './creditHandlers.ts';
import type { SeriesRepository } from '../repositories/seriesRepository.ts';
import { actorOf, viewerOf } from '../repositories/visibility.ts';
import { NotFoundError, UnauthorizedError } from '../types/errors.ts';
import type {
  CreateSeriesInput,
  ListSeriesQuery,
  UpdateSeriesInput,
} from '../types/series.ts';

// No try/catch anywhere below: the Express 5 router inspects the returned
// promise and calls next(err) itself when it rejects.
export function createSeriesController(repository: SeriesRepository) {
  // Row-level checks go through coAuthorGuard.ts, which holds the rule.
  const seriesTarget = (id: number): CoAuthorTarget => ({
    resource: 'Series',
    id,
    coAuthorIds: () => repository.findCoAuthorIds(id),
  });
  const MAY_ONLY_CHANGE_OWN = 'You may only change series you co-author';

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
      await assertMayChange(req, seriesTarget(id), MAY_ONLY_CHANGE_OWN);

      const series = await repository.update(
        id,
        validatedBody<UpdateSeriesInput>(req)
      );
      if (!series) throw new NotFoundError('Series', id);
      res.json(series);
    },

    remove: async (req, res) => {
      const { id } = validatedParams<{ id: number }>(req);
      await assertMayChange(req, seriesTarget(id), MAY_ONLY_CHANGE_OWN);

      const deleted = await repository.remove(id, actorOf(req));
      if (!deleted) throw new NotFoundError('Series', id);
      res.status(204).end();
    },

    ...creditHandlers({
      target: seriesTarget,
      module: 'series',
      refusal: MAY_ONLY_CHANGE_OWN,
      repository,
    }),

    // Taking a book out changes the series, so it is the series that answers:
    // one of its Co-authors, or a Moderator under `any`. The book's own
    // Co-authors leave through PATCH /api/books/:id with `seriesId: null`.
    removeBook: async (req, res) => {
      const { id, bookId } = validatedParams<{ id: number; bookId: number }>(
        req
      );
      await assertMayChange(req, seriesTarget(id), MAY_ONLY_CHANGE_OWN);

      const removed = await repository.removeBook(id, bookId);
      if (!removed) throw new NotFoundError('Series', id);
      res.status(204).end();
    },
  } satisfies Record<string, RequestHandler>;
}
