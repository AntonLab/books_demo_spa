import type { Request, RequestHandler } from 'express';
import {
  validatedBody,
  validatedParams,
  validatedQuery,
} from '../middleware/validate.ts';
import type { LikeRepository } from '../repositories/likeRepository.ts';
import { viewerOf } from '../repositories/visibility.ts';
import {
  ForbiddenError,
  NotFoundError,
  UnauthorizedError,
} from '../types/errors.ts';
import type {
  CreateLikeInput,
  ListLikesQuery,
  PublicLike,
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
  // The matrix grants `user` only `own` on update/delete — flipping or
  // removing someone else's like is not a plain user's call to make. Mirrors
  // commentController's assertOwned: 404 before 403, so a refusal cannot be
  // used to probe which ids exist, and `any` (admin) skips the owner
  // comparison entirely. Every other value, a missing scope included, is
  // compared: a handler mounted without requirePermission fails closed rather
  // than acting as `any`.
  const assertOwned = async (req: Request, id: number): Promise<PublicLike> => {
    const existing = await repository.findById(id, viewerOf(req.user));
    if (!existing) throw new NotFoundError('Like', id);

    if (req.permissionScope !== 'any' && existing.userId !== req.user?.id) {
      throw new ForbiddenError('You may only change your own likes');
    }

    return existing;
  };

  return {
    create: async (req, res) => {
      // requirePermission guarantees req.user here — `guest` has no create
      // grant on likes, so an anonymous request is a 401 before it arrives —
      // but the type is optional because most requests legitimately have
      // none, so narrow rather than assert.
      if (!req.user) throw new UnauthorizedError();

      const like = await repository.create(
        validatedBody<CreateLikeInput>(req),
        req.user.id
      );
      res.status(201).json(like);
    },

    // Returns full records, unlike the chapter list: every column is a number
    // or a boolean, so there is nothing large to keep behind GET /:id.
    list: async (req, res) => {
      const query = validatedQuery<ListLikesQuery>(req);
      const { items, total } = await repository.list(query, viewerOf(req.user));
      res.json({ items, total, limit: query.limit, offset: query.offset });
    },

    getById: async (req, res) => {
      const { id } = validatedParams<{ id: number }>(req);
      const like = await repository.findById(id, viewerOf(req.user));
      if (!like) throw new NotFoundError('Like', id);
      res.json(like);
    },

    update: async (req, res) => {
      const { id } = validatedParams<{ id: number }>(req);
      await assertOwned(req, id);

      const like = await repository.update(
        id,
        validatedBody<UpdateLikeInput>(req)
      );
      if (!like) throw new NotFoundError('Like', id);
      res.json(like);
    },

    remove: async (req, res) => {
      const { id } = validatedParams<{ id: number }>(req);
      await assertOwned(req, id);

      const deleted = await repository.remove(id);
      if (!deleted) throw new NotFoundError('Like', id);
      res.status(204).end();
    },
  };
}
