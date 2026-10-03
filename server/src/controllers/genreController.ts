import type { RequestHandler } from 'express';
import { isModeratorRole } from 'shared';
import type { AdminGenreListItem, GenreListItem, ItemsResponse } from 'shared';
import {
  validatedBody,
  validatedParams,
  validatedQuery,
} from '../middleware/validate.ts';
import type { GenreRepository } from '../repositories/genreRepository.ts';
import {
  ForbiddenError,
  NotFoundError,
  UnauthorizedError,
} from '../types/errors.ts';
import type {
  GenreInput,
  GenreUpdateInput,
  ListGenresQuery,
} from '../types/genre.ts';

// No ownership check anywhere in this file, unlike every other controller here:
// a Genre has no Owner (CONTEXT.md), so the matrix's `any` is the whole rule
// and there is no row to compare a caller against. The one extra gate is the
// moderator check on `?counts=1`, because the matrix cannot tell a query
// string apart. No Notification either — one covers who is credited on a work
// and its deletion, nothing else.
//
// No try/catch: the Express 5 router inspects the returned promise and calls
// next(err) itself when it rejects.
export function createGenreController(repository: GenreRepository) {
  return {
    // Rides on `genres × read`, which `guest` holds, so the header's
    // Genres menu renders for a visitor with no session. No paging envelope:
    // the list is short and every caller wants it whole. `counts` wins over
    // `nonEmpty` and is for a moderator only.
    list: async (req, res) => {
      const { nonEmpty = false, counts = false } =
        validatedQuery<ListGenresQuery>(req);
      if (counts) {
        if (!req.user) throw new UnauthorizedError();
        if (!isModeratorRole(req.user.role)) throw new ForbiddenError();
        const items = await repository.listWithCounts();
        res.json({ items } satisfies ItemsResponse<AdminGenreListItem>);
        return;
      }
      const items = await repository.list({ nonEmpty });
      res.json({ items } satisfies ItemsResponse<GenreListItem>);
    },

    // A name already taken among its siblings is the repository's ConflictError
    // (409) and a missing or nested parent its 400; a blank or over-long name
    // never reaches here, because validate refused it.
    create: async (req, res) => {
      const genre = await repository.create(validatedBody<GenreInput>(req));
      res.status(201).json(genre);
    },

    // Renaming a Genre to its own name, or to another casing of it, is
    // allowed — the unique index never compares a row with itself.
    update: async (req, res) => {
      const { id } = validatedParams<{ id: number }>(req);
      const genre = await repository.update(
        id,
        validatedBody<GenreUpdateInput>(req)
      );
      if (!genre) throw new NotFoundError('Genre', id);
      res.json(genre);
    },

    // The Books and Series in the Genre are left with `genre: null` by the
    // foreign key, in the same statement.
    remove: async (req, res) => {
      const { id } = validatedParams<{ id: number }>(req);
      const deleted = await repository.remove(id);
      if (!deleted) throw new NotFoundError('Genre', id);
      res.status(204).end();
    },
  } satisfies Record<string, RequestHandler>;
}
