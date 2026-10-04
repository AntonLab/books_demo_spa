import type { GenreListItem, PublicGenre } from 'shared';

export const GENRE_PATH_SEPARATOR = ' / ';

export type GenreNode<T extends GenreListItem> = { item: T; children: T[] };

// A Genre never vanishes from the tree: the nonEmpty list can omit a parent
// that has no Books of its own, and the tree is only two levels deep, so an
// orphan or a Subgenre of a Subgenre is shown at the top level.
export const buildGenreTree = <T extends GenreListItem>(
  items: readonly T[]
): GenreNode<T>[] => {
  const byId = new Map(items.map((item) => [item.id, item]));
  const isTopLevel = (item: T) => {
    const parent = item.parentId === null ? undefined : byId.get(item.parentId);
    return parent === undefined || parent.parentId !== null;
  };
  return items.filter(isTopLevel).map((item) => ({
    item,
    children: items.filter(
      (child) => child.parentId === item.id && !isTopLevel(child)
    ),
  }));
};

export const genrePathOf = (
  id: number,
  items: readonly GenreListItem[]
): string => {
  const item = items.find((candidate) => candidate.id === id);
  if (item === undefined) return '';
  const parent = items.find((candidate) => candidate.id === item.parentId);
  return parent === undefined
    ? item.name
    : `${parent.name}${GENRE_PATH_SEPARATOR}${item.name}`;
};

export const genreSegments = (
  genre: PublicGenre
): { id: number; name: string }[] => [
  ...(genre.parent === null ? [] : [genre.parent]),
  { id: genre.id, name: genre.name },
];
