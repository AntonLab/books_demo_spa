import { request } from './client';
import type { CreateFavoritePayload } from 'shared';
import type { PublicFavorite } from '../types/api';

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
