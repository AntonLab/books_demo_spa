import type { RequestHandler } from 'express';
import {
  validatedBody,
  validatedParams,
  validatedQuery,
} from '../middleware/validate.ts';
import type { LibraryRepository } from '../repositories/libraryRepository.ts';
import { actorOf } from '../repositories/visibility.ts';
import type {
  ListLibraryQuery,
  SetReadingStatusInput,
} from '../types/library.ts';

// Whose Library this is comes from the session and nowhere else.
export function createLibraryController(repository: LibraryRepository) {
  return {
    set: async (req, res) => {
      const { bookId } = validatedParams<{ bookId: number }>(req);
      const { status } = validatedBody<SetReadingStatusInput>(req);
      res.json(await repository.set(bookId, status, actorOf(req)));
    },

    clear: async (req, res) => {
      const { bookId } = validatedParams<{ bookId: number }>(req);
      await repository.clear(bookId, actorOf(req).id);
      res.status(204).end();
    },

    list: async (req, res) => {
      const query = validatedQuery<ListLibraryQuery>(req);
      const { items, total } = await repository.list(query, actorOf(req));
      res.json({
        items,
        total,
        current: query.current,
        pageSize: query.pageSize,
      });
    },
  } satisfies Record<string, RequestHandler>;
}
