import type { AdminGenreListItem, GenreListItem, PublicGenre } from 'shared';

export const genreItem = (
  id: number,
  name: string,
  parentId: number | null = null
): GenreListItem => ({ id, name, parentId });

export const adminGenre = (
  id: number,
  name: string,
  parentId: number | null = null,
  bookCount = 0,
  seriesCount = 0
): AdminGenreListItem => ({ id, name, parentId, bookCount, seriesCount });

export const publicGenre = (
  id: number,
  name: string,
  parent: { id: number; name: string } | null = null
): PublicGenre => ({ id, name, parent });
