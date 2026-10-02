import { act, waitFor } from '@testing-library/react';
import { useLocation, useNavigationType } from 'react-router';
import { useProfileBooks } from './useProfileLists';
import { renderHookWithProviders } from '@/test/renderWithProviders';
import { genreItem } from '@/test/genres';
import * as booksApi from '@/api/books';
import * as genresApi from '@/api/genres';
import type { PublicBook } from '@/types/book';
import type { ProfileScope } from '@/types/profileScope';

jest.mock('@/api/books');
jest.mock('@/api/genres');
const mockedBooks = jest.mocked(booksApi);
const mockedGenres = jest.mocked(genresApi);

const row = {
  id: 1,
  title: 'Book 1',
  favoriteId: 41,
} as unknown as PublicBook & { favoriteId: number };
const setup = (scope: ProfileScope, route: string) =>
  renderHookWithProviders(
    () => ({
      state: useProfileBooks(scope, 3),
      location: useLocation(),
      navType: useNavigationType(),
    }),
    { route }
  );
const rowsOf = ({ current }: ReturnType<typeof setup>['result']) =>
  current.state.list.items;

beforeEach(() => {
  jest.resetAllMocks();
  mockedGenres.listGenres.mockResolvedValue({
    items: [genreItem(4, 'Gothic')],
  });
  const body = { items: [row], total: 1, current: 1, pageSize: 20 };
  mockedBooks.listBooks.mockResolvedValue(body);
  mockedBooks.listFavoritedBooks.mockResolvedValue(body);
});

describe('useProfileBooks', () => {
  it('My works asks for the URL search as the viewer, and the picked author cannot replace the viewer', async () => {
    const { result } = setup(
      'mine',
      '/p?q=dragon&status=complete&page=2&pageSize=50&sort=new&author=ann&authorId=9'
    );

    await waitFor(() => expect(rowsOf(result)).toHaveLength(1));
    const asked = mockedBooks.listBooks.mock.calls[0]?.[0];
    expect(asked).toMatchObject({
      q: 'dragon',
      status: 'complete',
      sort: 'new',
      current: 2,
      pageSize: 50,
      userId: 3,
    });
    expect(result.current.state.list).toMatchObject({ page: 2, pageSize: 50 });
  });

  it('Favorites asks the favorited list only, and keeps each favorite id', async () => {
    const { result } = setup('favorites', '/p?q=x');

    await waitFor(() => expect(rowsOf(result)[0]?.favoriteId).toBe(41));
    expect(mockedBooks.listFavoritedBooks).toHaveBeenCalledWith(
      expect.objectContaining({ q: 'x' })
    );
    expect(mockedBooks.listBooks).not.toHaveBeenCalled();
  });

  it('shows an empty list, asking nothing, for a genre that is no id', async () => {
    const { result } = setup('mine', '/p?genre=abc');

    await waitFor(() => expect(mockedGenres.listGenres).toHaveBeenCalled());
    expect(mockedBooks.listBooks).not.toHaveBeenCalled();
    expect(result.current.state.list).toMatchObject({
      items: [],
      isPending: false,
      filtered: true,
    });
  });

  it('asks for an unknown genre id as it is, with the form field empty; a known one fills it', async () => {
    const unknown = setup('mine', '/p?genre=99');
    await waitFor(() => expect(rowsOf(unknown.result)).toHaveLength(1));
    expect(mockedBooks.listBooks).toHaveBeenCalledWith(
      expect.objectContaining({ genreId: 99 })
    );
    expect(
      unknown.result.current.state.form.initialValues.genre
    ).toBeUndefined();

    const known = setup('mine', '/p?genre=4');
    await waitFor(() =>
      expect(known.result.current.state.form.initialValues.genre).toBe(4)
    );
  });

  it('Search resets the page and keeps the size, Reset clears all, goToPage pushes an entry', () => {
    const { result } = setup('mine', '/p?page=3&pageSize=50');

    act(() =>
      result.current.state.form.onSearch({ q: ' dragon ', sort: 'new' })
    );
    expect(result.current.location.search).toBe(
      '?q=dragon&sort=new&pageSize=50'
    );
    act(() => result.current.state.list.goToPage(2, 20));
    expect(result.current.location.search).toBe('?q=dragon&sort=new&page=2');
    expect(result.current.navType).toBe('PUSH');
    act(() => result.current.state.form.onReset());
    expect(result.current.location.search).toBe('');
  });
});
