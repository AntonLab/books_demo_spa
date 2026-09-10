import type { Request, RequestHandler } from 'express';
import {
  validatedBody,
  validatedParams,
  validatedQuery,
} from '../middleware/validate.ts';
import type { SeriesRepository } from '../repositories/seriesRepository.ts';
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

export interface SeriesController {
  create: RequestHandler;
  list: RequestHandler;
  getById: RequestHandler;
  update: RequestHandler;
  remove: RequestHandler;
}

// No try/catch anywhere below: the Express 5 router inspects the returned
// promise and calls next(err) itself when it rejects.
export function createSeriesController(
  repository: SeriesRepository
): SeriesController {
  // The other half of enforcement. requirePermission already refused `none`;
  // `any` needs nothing more, and `own` is the only case that has to look at
  // the row — which is why this cannot live in the middleware, where the row
  // is not loaded yet.
  //
  // 404 before 403, so a refusal cannot be used to probe which ids exist.
  const assertMayTouch = async (req: Request, id: number): Promise<void> => {
    if (req.permissionScope !== 'own') return;

    const ownerId = await repository.findOwnerId(id);
    if (ownerId === null) throw new NotFoundError('Series', id);
    if (ownerId !== req.user?.id) {
      throw new ForbiddenError('You may only change your own series');
    }
  };

  return {
    create: async (req, res) => {
      if (!req.user) throw new UnauthorizedError();

      // The owner comes from the session, never the body — otherwise an
      // author could create a series owned by someone else and the ownership
      // rule above would mean nothing.
      const series = await repository.create({
        ...validatedBody<CreateSeriesInput>(req),
        userId: req.user.id,
      });
      res.status(201).json(series);
    },

    list: async (req, res) => {
      const query = validatedQuery<ListSeriesQuery>(req);
      const { items, total } = await repository.list(query);
      res.json({ items, total, limit: query.limit, offset: query.offset });
    },

    getById: async (req, res) => {
      const { id } = validatedParams<{ id: number }>(req);
      const series = await repository.findById(id);
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

      const deleted = await repository.remove(id);
      if (!deleted) throw new NotFoundError('Series', id);
      res.status(204).end();
    },
  };
}
