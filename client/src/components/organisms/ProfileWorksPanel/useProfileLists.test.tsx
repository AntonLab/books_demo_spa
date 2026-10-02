import { act, waitFor } from '@testing-library/react';
import { useLocation, useNavigationType } from 'react-router';
import {
  profileTabOf,
  useProfileBooks,
  useProfileSeries,
} from './useProfileLists';
import { renderHookWithProviders } from '@/test/renderWithProviders';
import { genreItem } from '@/test/genres';
import * as booksApi from '@/api/books';
import * as genresApi from '@/api/genres';
import * as seriesApi from '@/api/series';
import type { PublicSeries } from '@/types/api';
import type { PublicBook } from '@/types/book';
import type { ProfileScope } from '@/types/profileScope';

jest.mock('@/api/books');
jest.mock('@/api/genres');
jest.mock('@/api/series');
const mockedSeries = jest.mocked(seriesApi);
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
    // total 1 would make page 2 overshoot and clamp back to 1
    mockedBooks.listBooks.mockResolvedValue({
      items: [row],
      total: 100,
      current: 2,
      pageSize: 50,
    });
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

// Every render's page and pending flag, to prove a past-the-end page is never
// painted as ready.
const recording = <S extends { list: { page: number; isPending: boolean } }>(
  use: () => S,
  route: string
) => {
  const seen: { page: number; isPending: boolean }[] = [];
  const view = renderHookWithProviders(
    () => {
      const state = use();
      seen.push({ page: state.list.page, isPending: state.list.isPending });
      return { state, location: useLocation(), navType: useNavigationType() };
    },
    { route }
  );
  return { ...view, seen };
};

describe('profileTabOf', () => {
  it('is series only for tab=series', () => {
    expect(profileTabOf(new URLSearchParams('tab=series&q=x'))).toBe('series');
    expect(profileTabOf(new URLSearchParams('tab=bogus'))).toBe('books');
    expect(profileTabOf(new URLSearchParams(''))).toBe('books');
  });
});

describe('useProfileBooks in My works without Author', () => {
  it('ignores a typed author: not asked, not counted, not in the form', async () => {
    const { result } = setup('mine', '/p?author=ann&authorId=9&q=x');

    await waitFor(() => expect(rowsOf(result)).toHaveLength(1));
    const asked = mockedBooks.listBooks.mock.calls[0]?.[0];
    expect(asked).toMatchObject({ q: 'x', userId: 3 });
    expect(asked?.author).toBeUndefined();
    expect(result.current.state.filterCount).toBe(1);
    expect(result.current.state.form.initialValues.author).toBeUndefined();
  });

  it('Favorites keeps the author filter', async () => {
    const { result } = setup('favorites', '/p?author=ann');

    await waitFor(() => expect(rowsOf(result)).toHaveLength(1));
    expect(mockedBooks.listFavoritedBooks).toHaveBeenCalledWith(
      expect.objectContaining({ author: 'ann' })
    );
    expect(result.current.state.filterCount).toBe(1);
  });
});

describe('page clamp', () => {
  it('Books: replaces a page past the end with the last one, never shown as ready', async () => {
    mockedBooks.listBooks.mockResolvedValue({
      items: [row],
      total: 41,
      current: 3,
      pageSize: 20,
    });
    const { result, seen } = recording(
      () => useProfileBooks('mine', 3),
      '/p?q=x&page=9'
    );

    await waitFor(() =>
      expect(result.current.location.search).toBe('?q=x&page=3')
    );
    expect(result.current.navType).toBe('REPLACE');
    await waitFor(() =>
      expect(result.current.state.list.isPending).toBe(false)
    );
    expect(
      seen.filter((entry) => entry.page === 9 && !entry.isPending)
    ).toEqual([]);
  });

  // The refetch after a removal or delete answers with a lower total, so the
  // page the viewer stood on no longer exists.
  it('Books: steps back a page when the last row of the last page goes', async () => {
    mockedBooks.listFavoritedBooks
      .mockResolvedValueOnce({
        items: [row],
        total: 41,
        current: 3,
        pageSize: 20,
      })
      .mockResolvedValue({ items: [row], total: 40, current: 2, pageSize: 20 });
    const { result, queryClient } = setup('favorites', '/p?page=3');

    await waitFor(() => expect(rowsOf(result)).toHaveLength(1));
    await act(() => queryClient.invalidateQueries({ queryKey: ['books'] }));

    await waitFor(() => expect(result.current.location.search).toBe('?page=2'));
    expect(result.current.navType).toBe('REPLACE');
  });
});

const seriesRow = {
  id: 5,
  title: 'Series 5',
  favoriteId: 61,
} as unknown as PublicSeries & { favoriteId: number };
const seriesBody = { items: [seriesRow], total: 1, limit: 20, offset: 0 };
const setupSeries = (scope: ProfileScope, route: string) =>
  renderHookWithProviders(
    () => ({
      state: useProfileSeries(scope, 3),
      location: useLocation(),
      navType: useNavigationType(),
    }),
    { route }
  );

describe('useProfileSeries', () => {
  beforeEach(() => {
    mockedSeries.listSeries.mockResolvedValue(seriesBody);
    mockedSeries.listFavoritedSeries.mockResolvedValue(seriesBody);
  });

  it('My works asks for the URL search as the viewer, offset from page and size', async () => {
    const { result } = setupSeries(
      'mine',
      '/p?tab=series&q=saga&genre=4&tag=epic&page=3&pageSize=50'
    );

    await waitFor(() =>
      expect(result.current.state.list.items).toHaveLength(1)
    );
    expect(mockedSeries.listSeries).toHaveBeenCalledWith({
      q: 'saga',
      genreId: 4,
      tag: 'epic',
      limit: 50,
      offset: 100,
      userId: 3,
    });
    expect(result.current.state.filterCount).toBe(3);
  });

  it('Favorites asks the favorited list only, and keeps each favorite id', async () => {
    const { result } = setupSeries('favorites', '/p?tab=series&tag=x');

    await waitFor(() =>
      expect(result.current.state.list.items[0]?.favoriteId).toBe(61)
    );
    expect(mockedSeries.listFavoritedSeries).toHaveBeenCalledWith(
      expect.objectContaining({ tag: 'x' })
    );
    expect(mockedSeries.listSeries).not.toHaveBeenCalled();
  });

  it('shows an empty list, asking nothing, for a genre that is no id', async () => {
    const { result } = setupSeries('mine', '/p?tab=series&genre=abc');

    await waitFor(() => expect(mockedGenres.listGenres).toHaveBeenCalled());
    expect(mockedSeries.listSeries).not.toHaveBeenCalled();
    expect(result.current.state.list).toMatchObject({
      items: [],
      isPending: false,
      filtered: true,
    });
  });

  it('Search keeps the tab and size and resets the page, Reset keeps only the tab', () => {
    const { result } = setupSeries('mine', '/p?tab=series&page=3&pageSize=50');

    act(() =>
      result.current.state.form.onSearch({
        q: ' saga ',
        tag: 'epic',
        sort: 'popular',
      })
    );
    expect(result.current.location.search).toBe(
      '?tab=series&q=saga&tag=epic&pageSize=50'
    );
    act(() => result.current.state.list.goToPage(2, 20));
    expect(result.current.location.search).toBe(
      '?tab=series&q=saga&tag=epic&page=2'
    );
    expect(result.current.navType).toBe('PUSH');
    act(() => result.current.state.form.onReset());
    expect(result.current.location.search).toBe('?tab=series');
  });

  it('replaces an empty page past the end with the last one, never shown as ready', async () => {
    mockedSeries.listSeries.mockResolvedValue({
      items: [],
      total: 41,
      limit: 20,
      offset: 160,
    });
    const { result, seen } = recording(
      () => useProfileSeries('mine', 3),
      '/p?tab=series&page=9'
    );

    await waitFor(() =>
      expect(result.current.location.search).toBe('?tab=series&page=3')
    );
    expect(result.current.navType).toBe('REPLACE');
    expect(
      seen.filter((entry) => entry.page === 9 && !entry.isPending)
    ).toEqual([]);
  });

  it('steps back a page when the last row of the last page goes', async () => {
    mockedSeries.listFavoritedSeries
      .mockResolvedValueOnce({
        items: [seriesRow],
        total: 41,
        limit: 20,
        offset: 40,
      })
      .mockResolvedValue({
        items: [seriesRow],
        total: 40,
        limit: 20,
        offset: 20,
      });
    const { result, queryClient } = setupSeries(
      'favorites',
      '/p?tab=series&page=3'
    );

    await waitFor(() =>
      expect(result.current.state.list.items).toHaveLength(1)
    );
    await act(() => queryClient.invalidateQueries({ queryKey: ['series'] }));

    await waitFor(() =>
      expect(result.current.location.search).toBe('?tab=series&page=2')
    );
    expect(result.current.navType).toBe('REPLACE');
  });
});
