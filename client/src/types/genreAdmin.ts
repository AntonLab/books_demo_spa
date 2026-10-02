import type { AdminGenreListItem } from 'shared';
import type { GenreNode } from './genreTree';

export type UsageFilter = 'all' | 'books' | 'series' | 'unused';

interface Counts {
  bookCount: number;
  seriesCount: number;
}

// The server counts a Genre's own works; a top-level Genre shows its
// Subgenres' too.
export const totalsOf = (node: GenreNode<AdminGenreListItem>): Counts => ({
  bookCount: node.children.reduce(
    (sum, child) => sum + child.bookCount,
    node.item.bookCount
  ),
  seriesCount: node.children.reduce(
    (sum, child) => sum + child.seriesCount,
    node.item.seriesCount
  ),
});

const plural = (count: number, noun: string) =>
  `${count} ${noun}${count === 1 ? '' : 's'}`;

export const countsLabel = ({ bookCount, seriesCount }: Counts): string => {
  const parts = [
    bookCount > 0 && plural(bookCount, 'book'),
    seriesCount > 0 && `${seriesCount} series`,
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(', ') : 'No works';
};

const passesUsage = (counts: Counts, usage: UsageFilter): boolean =>
  usage === 'all' ||
  (usage === 'books' && counts.bookCount > 0) ||
  (usage === 'series' && counts.seriesCount > 0) ||
  (usage === 'unused' && counts.bookCount === 0 && counts.seriesCount === 0);

// A matching top-level Genre keeps the Subgenres that pass the usage; one that
// does not match stays as context when a Subgenre matches, with only those.
export const filterGenreTree = (
  nodes: readonly GenreNode<AdminGenreListItem>[],
  { query, usage }: { query: string; usage: UsageFilter }
): GenreNode<AdminGenreListItem>[] => {
  const needle = query.trim().toLowerCase();
  const matches = (item: AdminGenreListItem, counts: Counts) =>
    item.name.toLowerCase().includes(needle) && passesUsage(counts, usage);

  return nodes.flatMap((node) => {
    if (matches(node.item, totalsOf(node))) {
      return [
        {
          item: node.item,
          children: node.children.filter((child) => passesUsage(child, usage)),
        },
      ];
    }
    const children = node.children.filter((child) => matches(child, child));
    return children.length > 0 ? [{ item: node.item, children }] : [];
  });
};

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
