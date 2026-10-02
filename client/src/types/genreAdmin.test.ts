import { parentChoices } from './genreAdmin';
import { buildGenreTree } from './genreTree';
import { adminGenre } from '@/test/genres';

const tree = buildGenreTree([
  adminGenre(1, 'Fantasy'),
  adminGenre(2, 'Urban', 1),
  adminGenre(7, 'Epic', 1),
  adminGenre(3, 'Horror'),
  adminGenre(4, 'Gothic', 3),
  adminGenre(5, 'Mystery'),
  adminGenre(6, 'Romance'),
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
