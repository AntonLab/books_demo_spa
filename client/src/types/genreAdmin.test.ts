import {
  countsLabel,
  dropParentOf,
  filterGenreTree,
  parentChoices,
  totalsOf,
  type UsageFilter,
} from './genreAdmin';
import { buildGenreTree } from './genreTree';
import { adminGenre } from '@/test/genres';

const tree = buildGenreTree([
  adminGenre(1, 'Fantasy'),
  adminGenre(2, 'Urban', 1, 3, 1),
  adminGenre(7, 'Epic', 1),
  adminGenre(3, 'Horror', null, 2, 0),
  adminGenre(4, 'Gothic', 3),
  adminGenre(5, 'Mystery'),
  adminGenre(6, 'Romance', null, 0, 4),
]);

const nodeOf = (id: number) => tree.find((node) => node.item.id === id)!;

// Each kept top-level Genre with the ids of the Subgenres kept under it.
const shape = (query: string, usage: UsageFilter = 'all') =>
  filterGenreTree(tree, { query, usage }).map((node) => [
    node.item.id,
    node.children.map((child) => child.id),
  ]);

describe('parentChoices', () => {
  it('offers every top-level Genre when creating', () => {
    expect(parentChoices(tree).map((g) => g.id)).toEqual([1, 3, 5, 6]);
  });
  it('leaves out the edited Genre', () => {
    expect(parentChoices(tree, 5).map((g) => g.id)).toEqual([1, 3, 6]);
  });
  it('offers nothing to a Genre that has Subgenres', () => {
    expect(parentChoices(tree, 1)).toEqual([]);
  });
  it('offers every top-level Genre to a Subgenre', () => {
    expect(parentChoices(tree, 2).map((g) => g.id)).toEqual([1, 3, 5, 6]);
  });
});

describe('dropParentOf', () => {
  it('demotes a childless top-level Genre when dropped inside another', () => {
    expect(dropParentOf(tree, 5, 1, false)).toEqual({ parentId: 1 });
  });
  it('moves a Subgenre inside another top-level Genre', () => {
    expect(dropParentOf(tree, 2, 3, false)).toEqual({ parentId: 3 });
  });
  it('promotes a Subgenre dropped beside a top-level Genre', () => {
    expect(dropParentOf(tree, 2, 5, true)).toEqual({ parentId: null });
  });
  it('moves a Subgenre dropped beside a Subgenre of another parent', () => {
    expect(dropParentOf(tree, 2, 4, true)).toEqual({ parentId: 3 });
  });
  it('refuses a drop on itself', () => {
    expect(dropParentOf(tree, 5, 5, false)).toBeNull();
  });
  it('refuses a drop inside the current parent', () => {
    expect(dropParentOf(tree, 2, 1, false)).toBeNull();
  });
  it('refuses a drop inside a Subgenre', () => {
    expect(dropParentOf(tree, 5, 2, false)).toBeNull();
  });
  it('refuses a gap drop that changes nothing', () => {
    expect(dropParentOf(tree, 2, 7, true)).toBeNull();
    expect(dropParentOf(tree, 5, 6, true)).toBeNull();
  });
  it('refuses to demote a Genre that has Subgenres', () => {
    expect(dropParentOf(tree, 1, 5, false)).toBeNull();
    expect(dropParentOf(tree, 1, 4, true)).toBeNull();
  });
  it('refuses unknown ids', () => {
    expect(dropParentOf(tree, 99, 1, false)).toBeNull();
    expect(dropParentOf(tree, 1, 99, true)).toBeNull();
  });
});

describe('totalsOf', () => {
  it('sums a top-level Genre with its Subgenres', () => {
    expect(totalsOf(nodeOf(1))).toEqual({ bookCount: 3, seriesCount: 1 });
  });
});

describe('countsLabel', () => {
  it('labels counts with singular and plural, and an empty Genre', () => {
    expect(countsLabel({ bookCount: 3, seriesCount: 1 })).toBe(
      '3 books, 1 series'
    );
    expect(countsLabel({ bookCount: 1, seriesCount: 0 })).toBe('1 book');
    expect(countsLabel({ bookCount: 0, seriesCount: 0 })).toBe('No works');
  });
});

describe('filterGenreTree', () => {
  it('returns everything for an empty query and all', () => {
    expect(shape('')).toEqual([
      [1, [2, 7]],
      [3, [4]],
      [5, []],
      [6, []],
    ]);
  });
  it('keeps a matching top-level Genre with all its Subgenres', () => {
    expect(shape('fant')).toEqual([[1, [2, 7]]]);
  });
  it('keeps a non-matching parent as context with only the matching Subgenres', () => {
    expect(shape('urban')).toEqual([[1, [2]]]);
  });
  it('matches the query case-insensitively on the trimmed text', () => {
    expect(shape('  HORR ')).toEqual([[3, [4]]]);
  });
  it('filters by own counts for a Subgenre and by totals for a top-level Genre', () => {
    expect(shape('', 'books')).toEqual([
      [1, [2]],
      [3, []],
    ]);
    expect(shape('', 'series')).toEqual([
      [1, [2]],
      [6, []],
    ]);
    expect(shape('', 'unused')).toEqual([
      [1, [7]],
      [3, [4]],
      [5, []],
    ]);
  });
  it('combines the query and the usage', () => {
    expect(shape('o', 'unused')).toEqual([[3, [4]]]);
  });
  it('returns [] when nothing matches', () => {
    expect(shape('zzz')).toEqual([]);
  });
  it('leaves the input untouched', () => {
    filterGenreTree(tree, { query: 'urban', usage: 'books' });
    expect(tree[0]!.children.map((child) => child.id)).toEqual([2, 7]);
  });
});
