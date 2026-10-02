import {
  buildGenreTree,
  genrePathOf,
  genreSegments,
  publicGenrePath,
} from './genreTree';
import { genreItem, publicGenre } from '@/test/genres';

const items = [
  genreItem(2, 'Urban Fantasy', 1),
  genreItem(1, 'Fantasy'),
  genreItem(3, 'Horror'),
  genreItem(9, 'Lost', 99),
];

describe('buildGenreTree', () => {
  it('nests Subgenres under their parent, keeping the input order', () => {
    const tree = buildGenreTree(items);

    expect(tree.map((n) => n.item.id)).toEqual([1, 3, 9]);
    expect(tree[0]?.children.map((c) => c.id)).toEqual([2]);
    expect(tree[1]?.children).toEqual([]);
  });

  it('shows an orphan Subgenre at the top level', () => {
    const [, , orphan] = buildGenreTree(items);

    expect(orphan?.item.name).toBe('Lost');
    expect(orphan?.children).toEqual([]);
  });

  it('shows a Subgenre of a Subgenre at the top level instead of dropping it', () => {
    const tree = buildGenreTree([
      genreItem(1, 'A'),
      genreItem(2, 'B', 1),
      genreItem(3, 'C', 2),
    ]);

    expect(tree.map((n) => n.item.id)).toEqual([1, 3]);
  });
});

describe('paths', () => {
  it('joins parent and name with the separator', () => {
    expect(genrePathOf(2, items)).toBe('Fantasy / Urban Fantasy');
    expect(genrePathOf(1, items)).toBe('Fantasy');
    expect(genrePathOf(9, items)).toBe('Lost');
    expect(genrePathOf(404, items)).toBe('');
  });

  it('builds the same path and the segments from a PublicGenre', () => {
    const g = publicGenre(2, 'Urban Fantasy', { id: 1, name: 'Fantasy' });

    expect(publicGenrePath(g)).toBe('Fantasy / Urban Fantasy');
    expect(genreSegments(g)).toEqual([
      { id: 1, name: 'Fantasy' },
      { id: 2, name: 'Urban Fantasy' },
    ]);
    expect(genreSegments(publicGenre(3, 'Horror'))).toEqual([
      { id: 3, name: 'Horror' },
    ]);
  });
});
