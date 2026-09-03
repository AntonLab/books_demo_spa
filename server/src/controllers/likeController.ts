import type { RequestHandler } from 'express';
import {
  validatedBody,
  validatedParams,
  validatedQuery,
} from '../middleware/validate.ts';
import type { LikeRepository } from '../repositories/likeRepository.ts';
import { NotFoundError } from '../types/errors.ts';
import type {
  CreateLikeInput,
  ListLikesQuery,
  UpdateLikeInput,
} from '../types/like.ts';

export interface LikeController {
  create: RequestHandler;
  list: RequestHandler;
  getById: RequestHandler;
  update: RequestHandler;
  remove: RequestHandler;
}

// No try/catch anywhere below: the Express 5 router inspects the returned
// promise and calls next(err) itself when it rejects.
export function createLikeController(
  repository: LikeRepository
): LikeController {
  return {
    create: async (req, res) => {
      const like = await repository.create(validatedBody<CreateLikeInput>(req));
      res.status(201).json(like);
    },

    // Returns full records, unlike the chapter list: every column is a number
    // or a boolean, so there is nothing large to keep behind GET /:id.
    list: async (req, res) => {
      const query = validatedQuery<ListLikesQuery>(req);
      const { items, total } = await repository.list(query);
      res.json({ items, total, limit: query.limit, offset: query.offset });
    },

    getById: async (req, res) => {
      const { id } = validatedParams<{ id: number }>(req);
      const like = await repository.findById(id);
      if (!like) throw new NotFoundError('Like', id);
      res.json(like);
    },

    update: async (req, res) => {
      const { id } = validatedParams<{ id: number }>(req);
      const like = await repository.update(
        id,
        validatedBody<UpdateLikeInput>(req)
      );
      if (!like) throw new NotFoundError('Like', id);
      res.json(like);
    },

    remove: async (req, res) => {
      const { id } = validatedParams<{ id: number }>(req);
      const deleted = await repository.remove(id);
      if (!deleted) throw new NotFoundError('Like', id);
      res.status(204).end();
    },
  };
}
