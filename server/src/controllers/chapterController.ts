import type { Request, RequestHandler } from 'express';
import {
  validatedBody,
  validatedParams,
  validatedQuery,
} from '../middleware/validate.ts';
import type { ChapterRepository } from '../repositories/chapterRepository.ts';
import { viewerOf } from '../repositories/visibility.ts';
import { ForbiddenError, NotFoundError } from '../types/errors.ts';
import type {
  CreateChapterInput,
  ListChaptersQuery,
  ReorderChaptersInput,
  UpdateChapterInput,
} from '../types/chapter.ts';

export interface ChapterController {
  create: RequestHandler;
  list: RequestHandler;
  getById: RequestHandler;
  update: RequestHandler;
  remove: RequestHandler;
  reorder: RequestHandler;
}

// No try/catch anywhere below: the Express 5 router inspects the returned
// promise and calls next(err) itself when it rejects.
export function createChapterController(
  repository: ChapterRepository
): ChapterController {
  // The other half of enforcement. requirePermission already refused `none`;
  // `any` needs nothing more, and `own` is the only case that has to look at
  // the row — which is why this cannot live in the middleware, where the row
  // is not loaded yet.
  //
  // Only `any` returns early, here and in assertMayAddTo below. Every other
  // value, a missing scope included, falls through to the owner comparison: a
  // handler mounted without requirePermission fails closed rather than acting
  // as `any`.
  //
  // 404 before 403, so a refusal cannot be used to probe which ids exist.
  //
  // `own` means "one of the book's Co-authors" (ADR-0005).
  const isCredited = (req: Request, coAuthorIds: number[]): boolean =>
    req.user !== undefined && coAuthorIds.includes(req.user.id);

  const assertMayTouch = async (req: Request, id: number): Promise<void> => {
    if (req.permissionScope === 'any') return;

    const coAuthorIds = await repository.findCoAuthorIds(id);
    if (coAuthorIds === null) throw new NotFoundError('Chapter', id);
    if (!isCredited(req, coAuthorIds)) {
      throw new ForbiddenError(
        'You may only change chapters in books you co-author'
      );
    }
  };

  // A create has no chapter to own yet, and a reorder touches the book's
  // chapters as a whole, so the book answers for both.
  const assertMayChangeChaptersOf = async (
    req: Request,
    bookId: number,
    refusal: string
  ): Promise<void> => {
    if (req.permissionScope === 'any') return;

    const coAuthorIds = await repository.findBookCoAuthorIds(bookId);
    if (coAuthorIds === null) throw new NotFoundError('Book', bookId);
    if (!isCredited(req, coAuthorIds)) throw new ForbiddenError(refusal);
  };

  return {
    create: async (req, res) => {
      const input = validatedBody<CreateChapterInput>(req);
      await assertMayChangeChaptersOf(
        req,
        input.bookId,
        'You may only add chapters to books you co-author'
      );

      const chapter = await repository.create(input);
      res.status(201).json(chapter);
    },

    // Returns summaries, not full records: the body lives behind GET /:id so a
    // page of twenty chapters cannot drag twenty MEDIUMTEXT columns with it.
    list: async (req, res) => {
      const query = validatedQuery<ListChaptersQuery>(req);
      const { items, total } = await repository.list(query, viewerOf(req.user));
      res.json({ items, total, limit: query.limit, offset: query.offset });
    },

    getById: async (req, res) => {
      const { id } = validatedParams<{ id: number }>(req);
      const chapter = await repository.findById(id, viewerOf(req.user));
      if (!chapter) throw new NotFoundError('Chapter', id);
      res.json(chapter);
    },

    update: async (req, res) => {
      const { id } = validatedParams<{ id: number }>(req);
      await assertMayTouch(req, id);

      const chapter = await repository.update(
        id,
        validatedBody<UpdateChapterInput>(req)
      );
      if (!chapter) throw new NotFoundError('Chapter', id);
      res.json(chapter);
    },

    remove: async (req, res) => {
      const { id } = validatedParams<{ id: number }>(req);
      await assertMayTouch(req, id);

      const deleted = await repository.remove(id);
      if (!deleted) throw new NotFoundError('Chapter', id);
      res.status(204).end();
    },

    reorder: async (req, res) => {
      const { id: bookId } = validatedParams<{ id: number }>(req);
      await assertMayChangeChaptersOf(
        req,
        bookId,
        'You may only reorder chapters in books you co-author'
      );

      const { chapterIds } = validatedBody<ReorderChaptersInput>(req);
      const found = await repository.reorder(bookId, chapterIds);
      if (!found) throw new NotFoundError('Book', bookId);
      res.status(204).end();
    },
  };
}
