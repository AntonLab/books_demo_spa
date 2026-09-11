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
  Tombstone,
  UpdateCommentInput,
} from '../types/comment.ts';

export interface CommentController {
  create: RequestHandler;
  list: RequestHandler;
  getById: RequestHandler;
  update: RequestHandler;
  remove: RequestHandler;
  restore: RequestHandler;
}

// requirePermission guarantees req.user on every write — `guest` has no write
// grant on comments, so an anonymous write is a 401 before it gets here — but
// the type is optional because most requests legitimately have none. This
// narrows in one place instead of asserting at three call sites.
function actorId(req: Request): number {
  if (!req.user) throw new UnauthorizedError();
  return req.user.id;
}

// No try/catch anywhere below: the Express 5 router inspects the returned
// promise and calls next(err) itself when it rejects.
export function createCommentController(
  repository: CommentRepository
): CommentController {
  // The same ownership rule books, series, chapters and likes enforce: `own`
  // may change only the caller's own comments. The check lives in the
  // controller rather than a middleware because it needs the repository, and
  // because keeping both writes' rule in one place is what stops them drifting
  // apart.
  //
  // 404 before 403 deliberately: reporting "forbidden" for a comment that does
  // not exist would leak which ids are real.
  const findOrThrow = async (id: number): Promise<PublicComment> => {
    const existing = await repository.findById(id);
    if (!existing) throw new NotFoundError('Comment', id);
    return existing;
  };

  // The same ownership rule books, series, chapters and likes enforce. `any`
  // skips the comparison — that is what lets a moderator act on a reported
  // comment. Every other value, a missing scope included, is compared: a
  // handler mounted without requirePermission fails closed rather than acting
  // as `any`.
  const assertOwner = (req: Request, comment: PublicComment): void => {
    if (req.permissionScope !== 'any' && comment.userId !== req.user?.id) {
      throw new ForbiddenError('You may only change your own comments');
    }
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
      // requirePermission sets req.user when a session resolves; null is what
      // makes viewerLikeId come back empty for an anonymous visitor.
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
      const existing = await findOrThrow(id);

      // Before the owner check: nobody — moderators included — may put text
      // back under a tombstone.
      if (existing.tombstone !== null) {
        throw new ForbiddenError('A deleted comment cannot be edited');
      }
      assertOwner(req, existing);

      const comment = await repository.update(
        id,
        validatedBody<UpdateCommentInput>(req)
      );
      if (!comment) throw new NotFoundError('Comment', id);
      res.json(comment);
    },

    remove: async (req, res) => {
      const { id } = validatedParams<{ id: number }>(req);
      const existing = await findOrThrow(id);

      // Already a tombstone: there is nothing left to delete, for anyone.
      if (existing.tombstone !== null) throw new NotFoundError('Comment', id);
      assertOwner(req, existing);

      // The owner deleting their own comment — an admin included — is a
      // deletion; anyone else reached this line through `any` and is
      // moderating.
      const kind: Tombstone =
        existing.userId === actorId(req) ? 'deleted' : 'removed';
      const removed = await repository.remove(id, kind);
      if (!removed) throw new NotFoundError('Comment', id);
      res.status(204).end();
    },

    restore: async (req, res) => {
      // Only a moderator restores. Refused before any lookup, so the answer
      // says nothing about which ids exist.
      if (req.permissionScope !== 'any') {
        throw new ForbiddenError('Only a moderator may restore a comment');
      }

      const { id } = validatedParams<{ id: number }>(req);
      const restored = await repository.restore(id);
      // Missing, live and owner-deleted all land here: none has anything a
      // moderator could restore.
      if (!restored) throw new NotFoundError('Comment', id);
      res.json(restored);
    },
  };
}
