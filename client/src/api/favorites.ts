import { request } from './client';
import type { CreateFavoritePayload, ListResponse } from 'shared';
import type {
  FavoriteBook,
  FavoriteSeries,
  PublicFavorite,
} from '../types/api';

export interface FavoritesPageParams {
  limit: number;
  offset: number;
}

const pageQuery = ({ limit, offset }: FavoritesPageParams) =>
  new URLSearchParams({
    limit: String(limit),
    offset: String(offset),
  }).toString();

// 409 when the work is already a Favorite, 404 when the viewer cannot see it.
export const createFavorite = (
  payload: CreateFavoritePayload
): Promise<PublicFavorite> => {
  return request<PublicFavorite>('/favorites', {
    method: 'POST',
    body: payload,
  });
};

// Takes the Favorite's own id (viewerFavoriteId, or a list row's id), never
// the work's. The server answers 204, which request() maps to undefined.
export const deleteFavorite = (id: number): Promise<void> => {
  return request<void>(`/favorites/${id}`, { method: 'DELETE' });
};

// Always the signed-in Account's own, newest first.
export const listFavoriteBooks = (
  params: FavoritesPageParams
): Promise<ListResponse<FavoriteBook>> => {
  return request<ListResponse<FavoriteBook>>(
    `/favorites/books?${pageQuery(params)}`
  );
};

export const listFavoriteSeries = (
  params: FavoritesPageParams
): Promise<ListResponse<FavoriteSeries>> => {
  return request<ListResponse<FavoriteSeries>>(
    `/favorites/series?${pageQuery(params)}`
  );
};
