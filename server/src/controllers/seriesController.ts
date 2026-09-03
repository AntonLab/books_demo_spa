import type { RequestHandler } from 'express';
import {
  validatedBody,
  validatedParams,
  validatedQuery,
} from '../middleware/validate.ts';
import type { SeriesRepository } from '../repositories/seriesRepository.ts';
import { NotFoundError } from '../types/errors.ts';
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
  return {
    create: async (req, res) => {
      const series = await repository.create(
        validatedBody<CreateSeriesInput>(req)
      );
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
      const series = await repository.update(
        id,
        validatedBody<UpdateSeriesInput>(req)
      );
      if (!series) throw new NotFoundError('Series', id);
      res.json(series);
    },

    remove: async (req, res) => {
      const { id } = validatedParams<{ id: number }>(req);
      const deleted = await repository.remove(id);
      if (!deleted) throw new NotFoundError('Series', id);
      res.status(204).end();
    },
  };
}
