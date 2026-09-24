import type { RequestHandler } from 'express';
import {
  validatedBody,
  validatedParams,
  validatedQuery,
} from '../middleware/validate.ts';
import type { ChapterRepository } from '../repositories/chapterRepository.ts';
import { viewerOf } from '../repositories/visibility.ts';
import { assertMayChange, type CoAuthorTarget } from './coAuthorGuard.ts';
import { NotFoundError } from '../types/errors.ts';
import type {
  CreateChapterInput,
  ListChaptersQuery,
  ReorderChaptersInput,
  UpdateChapterInput,
} from '../types/chapter.ts';

// No try/catch anywhere below: the Express 5 router inspects the returned
// promise and calls next(err) itself when it rejects.
export function createChapterController(repository: ChapterRepository) {
  // Row-level checks go through coAuthorGuard.ts, which holds the rule.
  // Chapters have no owner column: their book's Co-authors answer for them.
  const chapterTarget = (id: number): CoAuthorTarget => ({
    resource: 'Chapter',
    id,
    coAuthorIds: () => repository.findCoAuthorIds(id),
  });
  // A create has no chapter to own yet, and a reorder touches the book's
  // chapters as a whole, so the book answers for both.
  const bookTarget = (id: number): CoAuthorTarget => ({
    resource: 'Book',
    id,
    coAuthorIds: () => repository.findBookCoAuthorIds(id),
  });

  return {
    create: async (req, res) => {
      const input = validatedBody<CreateChapterInput>(req);
      await assertMayChange(
        req,
        bookTarget(input.bookId),
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
      await assertMayChange(
        req,
        chapterTarget(id),
        'You may only change chapters in books you co-author'
      );

      const chapter = await repository.update(
        id,
        validatedBody<UpdateChapterInput>(req)
      );
      if (!chapter) throw new NotFoundError('Chapter', id);
      res.json(chapter);
    },

    remove: async (req, res) => {
      const { id } = validatedParams<{ id: number }>(req);
      await assertMayChange(
        req,
        chapterTarget(id),
        'You may only change chapters in books you co-author'
      );

      const deleted = await repository.remove(id);
      if (!deleted) throw new NotFoundError('Chapter', id);
      res.status(204).end();
    },

    reorder: async (req, res) => {
      const { id: bookId } = validatedParams<{ id: number }>(req);
      await assertMayChange(
        req,
        bookTarget(bookId),
        'You may only reorder chapters in books you co-author'
      );

      const { chapterIds } = validatedBody<ReorderChaptersInput>(req);
      const found = await repository.reorder(bookId, chapterIds);
      if (!found) throw new NotFoundError('Book', bookId);
      res.status(204).end();
    },
  } satisfies Record<string, RequestHandler>;
}
