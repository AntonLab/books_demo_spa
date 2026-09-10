import { request } from './client';
import type { CreateLikePayload, PublicLike } from '../types/like';

export const createLike = (payload: CreateLikePayload): Promise<PublicLike> => {
  return request<PublicLike>('/likes', { method: 'POST', body: payload });
};

// The server answers 204, which request() maps to undefined.
export const deleteLike = (id: number): Promise<void> => {
  return request<void>(`/likes/${id}`, { method: 'DELETE' });
};
