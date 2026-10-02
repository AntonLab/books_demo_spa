import type { AdminGenreListItem } from 'shared';
import type { GenreNode } from './genreTree';

// A Subgenre cannot have Subgenres, so a Genre that has some can only stay top
// level, and the edited Genre is never its own parent.
export const parentChoices = (
  nodes: readonly GenreNode<AdminGenreListItem>[],
  editedId?: number
): AdminGenreListItem[] => {
  const edited = nodes.find((node) => node.item.id === editedId);
  if (edited !== undefined && edited.children.length > 0) return [];
  return nodes.map((node) => node.item).filter((item) => item.id !== editedId);
};
