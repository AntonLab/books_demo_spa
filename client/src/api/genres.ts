import { request } from './client';
import type {
  AdminGenreListItem,
  GenreListItem,
  GenrePayload,
  GenreUpdatePayload,
  ItemsResponse,
  PublicGenre,
} from 'shared';

// Flat, sorted by name, with no paging: the client builds the tree from each
// item's `parentId`. The response is `{ items }` rather than a paged envelope.
// `nonEmpty` keeps only Genres with a Book in progress or complete, plus their
// parents.
export const listGenres = (
  params: { nonEmpty?: boolean } = {}
): Promise<ItemsResponse<GenreListItem>> => {
  return request<ItemsResponse<GenreListItem>>(
    params.nonEmpty ? '/genres?nonEmpty=1' : '/genres'
  );
};

// The admin list: every Genre, with how many Books and Series point at it.
export const listGenreCounts = (): Promise<
  ItemsResponse<AdminGenreListItem>
> => {
  return request<ItemsResponse<AdminGenreListItem>>('/genres?counts=1');
};

export const createGenre = (payload: GenrePayload): Promise<PublicGenre> => {
  return request<PublicGenre>('/genres', { method: 'POST', body: payload });
};

// Renames, moves, promotes (`parentId: null`) or demotes a Genre; the body
// carries only the fields that change. The server answers 409 when a sibling
// already holds the name, case-insensitively.
export const updateGenre = (
  id: number,
  payload: GenreUpdatePayload
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
