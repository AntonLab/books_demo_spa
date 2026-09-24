import { request } from './client';
import type { PublicGenre } from 'shared';

// Both writes send the same one-field body, so one payload type covers them.
export interface GenrePayload {
  name: string;
}

// Sorted by name, with no paging: the list is short and the header's submenu
// shows all of it, so the response is `{ items }` rather than a paged
// envelope. `nonEmpty` keeps only Genres with a Book in progress or complete.
export const listGenres = (
  params: { nonEmpty?: boolean } = {}
): Promise<{ items: PublicGenre[] }> => {
  return request<{ items: PublicGenre[] }>(
    params.nonEmpty ? '/genres?nonEmpty=true' : '/genres'
  );
};

export const createGenre = (payload: GenrePayload): Promise<PublicGenre> => {
  return request<PublicGenre>('/genres', { method: 'POST', body: payload });
};

// A rename is the only update a Genre has: the server answers 409 when another
// Genre already holds the name, case-insensitively.
export const renameGenre = (
  id: number,
  payload: GenrePayload
): Promise<PublicGenre> => {
  return request<PublicGenre>(`/genres/${id}`, {
    method: 'PATCH',
    body: payload,
  });
};

// The books and series in it are not deleted with it; they are left without a
// Genre, through the foreign key.
export const deleteGenre = (id: number): Promise<void> => {
  return request<void>(`/genres/${id}`, { method: 'DELETE' });
};
