import type { Request, RequestHandler } from 'express';
import {
  validatedBody,
  validatedParams,
  validatedQuery,
} from '../middleware/validate.ts';
import type { CommentRepository } from '../repositories/commentRepository.ts';
import {
  ForbiddenError,
  NotFoundError,
  UnauthorizedError,
} from '../types/errors.ts';
import type {
  CreateCommentInput,
  ListCommentsQuery,
  PublicComment,
  UpdateCommentInput,
} from '../types/comment.ts';

export interface CommentController {
  create: RequestHandler;
  list: RequestHandler;
  getById: RequestHandler;
  update: RequestHandler;
  remove: RequestHandler;
}

// requireAuth guarantees req.user on every write, but the type is optional
// because most requests legitimately have none. This narrows in one place
// instead of asserting at three call sites.
function actorId(req: Request): number {
  if (!req.user) throw new UnauthorizedError();
  return req.user.id;
}

// No try/catch anywhere below: the Express 5 router inspects the returned
// promise and calls next(err) itself when it rejects.
export function createCommentController(
  repository: CommentRepository
): CommentController {
  // Comments are the first resource here to check ownership — books, series and
  // chapters still let any signed-in user write another user's rows. The check
  // lives in the controller rather than a middleware because it needs the
  // repository, and because keeping both writes' rule in one place is what
  // stops them drifting apart.
  //
  // 404 before 403 deliberately: reporting "forbidden" for a comment that does
  // not exist would leak which ids are real.
  // Returns the row it looked up, so a caller that also needs to inspect it —
  // `update`, checking isDeleted — does not pay for a second query.
  const assertOwned = async (
    id: number,
    userId: number
  ): Promise<PublicComment> => {
    const existing = await repository.findById(id);
    if (!existing) throw new NotFoundError('Comment', id);
    if (existing.userId !== userId) {
      throw new ForbiddenError('You may only change your own comments');
    }
    return existing;
  };

  return {
    create: async (req, res) => {
      const comment = await repository.create(
        validatedBody<CreateCommentInput>(req),
        actorId(req)
      );
      res.status(201).json(comment);
    },

    list: async (req, res) => {
      const query = validatedQuery<ListCommentsQuery>(req);
      // optionalAuth fills req.user when a session cookie resolves; null is
      // what makes viewerLikeId come back empty for an anonymous visitor.
      const { items, total } = await repository.list(
        query,
        req.user?.id ?? null
      );
      res.json({ items, total, limit: query.limit, offset: query.offset });
    },

    getById: async (req, res) => {
      const { id } = validatedParams<{ id: number }>(req);
      const comment = await repository.findById(id);
      if (!comment) throw new NotFoundError('Comment', id);
      res.json(comment);
    },

    update: async (req, res) => {
      const { id } = validatedParams<{ id: number }>(req);
      const existing = await assertOwned(id, actorId(req));

      // A deleted comment is a tombstone, not a draft: editing one would put
      // text back under a heading that says the author withdrew it.
      if (existing.isDeleted) {
        throw new ForbiddenError('A deleted comment cannot be edited');
      }

      const comment = await repository.update(
        id,
        validatedBody<UpdateCommentInput>(req)
      );
      if (!comment) throw new NotFoundError('Comment', id);
      res.json(comment);
    },

    remove: async (req, res) => {
      const { id } = validatedParams<{ id: number }>(req);
      await assertOwned(id, actorId(req));

      const removed = await repository.remove(id);
      if (!removed) throw new NotFoundError('Comment', id);
      res.status(204).end();
    },
  };
}
