import type { RequestHandler } from 'express';
import {
  validatedBody,
  validatedParams,
  validatedQuery,
} from '../middleware/validate.ts';
import type { ChapterRepository } from '../repositories/chapterRepository.ts';
import { NotFoundError } from '../types/errors.ts';
import type {
  CreateChapterInput,
  ListChaptersQuery,
  UpdateChapterInput,
} from '../types/chapter.ts';

export interface ChapterController {
  create: RequestHandler;
  list: RequestHandler;
  getById: RequestHandler;
  update: RequestHandler;
  remove: RequestHandler;
}

// No try/catch anywhere below: the Express 5 router inspects the returned
// promise and calls next(err) itself when it rejects.
export function createChapterController(
  repository: ChapterRepository
): ChapterController {
  return {
    create: async (req, res) => {
      const chapter = await repository.create(
        validatedBody<CreateChapterInput>(req)
      );
      res.status(201).json(chapter);
    },

    // Returns summaries, not full records: the body lives behind GET /:id so a
    // page of twenty chapters cannot drag twenty MEDIUMTEXT columns with it.
    list: async (req, res) => {
      const query = validatedQuery<ListChaptersQuery>(req);
      const { items, total } = await repository.list(query);
      res.json({ items, total, limit: query.limit, offset: query.offset });
    },

    getById: async (req, res) => {
      const { id } = validatedParams<{ id: number }>(req);
      const chapter = await repository.findById(id);
      if (!chapter) throw new NotFoundError('Chapter', id);
      res.json(chapter);
    },

    update: async (req, res) => {
      const { id } = validatedParams<{ id: number }>(req);
      const chapter = await repository.update(
        id,
        validatedBody<UpdateChapterInput>(req)
      );
      if (!chapter) throw new NotFoundError('Chapter', id);
      res.json(chapter);
    },

    remove: async (req, res) => {
      const { id } = validatedParams<{ id: number }>(req);
      const deleted = await repository.remove(id);
      if (!deleted) throw new NotFoundError('Chapter', id);
      res.status(204).end();
    },
  };
}
