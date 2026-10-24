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

    add: async (req, res) => {
      const { bookId } = validatedParams<{ bookId: number }>(req);
      res.json(await repository.addBook(bookId, actorOf(req)));
    },

    toggleNotInterested: async (req, res) => {
      const { bookId } = validatedParams<{ bookId: number }>(req);
      res.json(await repository.toggleNotInterested(bookId, actorOf(req)));
    },

    clear: async (req, res) => {
      const { bookId } = validatedParams<{ bookId: number }>(req);
      await repository.clear(bookId, actorOf(req));
      res.status(204).end();
    },

    addSeries: async (req, res) => {
      const { seriesId } = validatedParams<{ seriesId: number }>(req);
      res.json(await repository.addSeries(seriesId, actorOf(req)));
    },

    toggleSeriesNotInterested: async (req, res) => {
      const { seriesId } = validatedParams<{ seriesId: number }>(req);
      res.json(
        await repository.toggleSeriesNotInterested(seriesId, actorOf(req))
      );
    },

    clearSeries: async (req, res) => {
      const { seriesId } = validatedParams<{ seriesId: number }>(req);
      res.json(await repository.clearSeries(seriesId, actorOf(req)));
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
