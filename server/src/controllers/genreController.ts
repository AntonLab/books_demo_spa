import type { RequestHandler } from 'express';
import {
  validatedBody,
  validatedParams,
  validatedQuery,
} from '../middleware/validate.ts';
import type { GenreRepository } from '../repositories/genreRepository.ts';
import { NotFoundError } from '../types/errors.ts';
import type { GenreInput, ListGenresQuery } from '../types/genre.ts';

// No ownership check anywhere in this file, unlike every other controller here:
// a Genre has no Owner (CONTEXT.md), so the matrix's `any` is the whole rule
// (R1) and there is no row to compare a caller against. No Notification
// either — one covers who is credited on a work and its deletion, nothing else.
//
// No try/catch: the Express 5 router inspects the returned promise and calls
// next(err) itself when it rejects.
export function createGenreController(repository: GenreRepository) {
  return {
    // A1. Rides on `genres × read`, which `guest` holds, so the header's
    // Genres menu renders for a visitor with no session. No paging envelope:
    // the list is short and every caller wants it whole.
    list: async (req, res) => {
      const { nonEmpty = false } = validatedQuery<ListGenresQuery>(req);
      res.json({ items: await repository.list({ nonEmpty }) });
    },

    // A2. A name already taken is the repository's ConflictError (409); a
    // blank or over-long one never reaches here, because validate refused it.
    create: async (req, res) => {
      const genre = await repository.create(validatedBody<GenreInput>(req));
      res.status(201).json(genre);
    },

    // A3. Renaming a Genre to its own name, or to another casing of it, is
    // allowed — the unique index never compares a row with itself.
    update: async (req, res) => {
      const { id } = validatedParams<{ id: number }>(req);
      const genre = await repository.update(id, validatedBody<GenreInput>(req));
      if (!genre) throw new NotFoundError('Genre', id);
      res.json(genre);
    },

    // A4. The Books and Series in the Genre are left with `genre: null` by the
    // foreign key, in the same statement.
    remove: async (req, res) => {
      const { id } = validatedParams<{ id: number }>(req);
      const deleted = await repository.remove(id);
      if (!deleted) throw new NotFoundError('Genre', id);
      res.status(204).end();
    },
  } satisfies Record<string, RequestHandler>;
}
