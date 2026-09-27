import type { RequestHandler } from 'express';
import {
  validatedBody,
  validatedParams,
  validatedQuery,
} from '../middleware/validate.ts';
import type { FavoriteRepository } from '../repositories/favoriteRepository.ts';
import { actorOf } from '../repositories/visibility.ts';
import { NotFoundError } from '../types/errors.ts';
import type {
  CreateFavoriteInput,
  ListFavoritesQuery,
} from '../types/favorite.ts';

// Whose favorites these are comes from the session and nowhere else. There is
// no owner comparison and no `any` branch: remove is scoped to the caller in
// the repository, so another account's id is the same 404 as a missing one,
// Moderators included — Favorites are private.
export function createFavoriteController(repository: FavoriteRepository) {
  return {
    create: async (req, res) => {
      const favorite = await repository.create(
        validatedBody<CreateFavoriteInput>(req),
        actorOf(req)
      );
      res.status(201).json(favorite);
    },

    remove: async (req, res) => {
      const { id } = validatedParams<{ id: number }>(req);
      const deleted = await repository.remove(id, actorOf(req).id);
      if (!deleted) throw new NotFoundError('Favorite', id);
      res.status(204).end();
    },

    listBooks: async (req, res) => {
      const query = validatedQuery<ListFavoritesQuery>(req);
      const { items, total } = await repository.listBooks(query, actorOf(req));
      res.json({ items, total, limit: query.limit, offset: query.offset });
    },

    listSeries: async (req, res) => {
      const query = validatedQuery<ListFavoritesQuery>(req);
      const { items, total } = await repository.listSeries(query, actorOf(req));
      res.json({ items, total, limit: query.limit, offset: query.offset });
    },
  } satisfies Record<string, RequestHandler>;
}
