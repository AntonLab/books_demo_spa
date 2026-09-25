import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClientProvider, type QueryClient } from '@tanstack/react-query';
import dayjs from 'dayjs';
import type { ReactNode } from 'react';
import { MemoryRouter, useLocation } from 'react-router';
import type { PagedResponse } from 'shared';
import * as booksApi from '@/api/books';
import * as genresApi from '@/api/genres';
import { ApiError } from '@/api/client';
import { queryKeys } from '@/queries/keys';
import { createTestQueryClient } from '@/test/queryClient';
import type { PublicBook } from '@/types/book';
import {
  useSearchPage,
  type SearchPageState,
  type SearchResults,
} from './useSearchPage';

jest.mock('@/api/books');
jest.mock('@/api/genres');

const mockedBooks = jest.mocked(booksApi);
const mockedGenres = jest.mocked(genresApi);

const pageOf = (
  overrides: Partial<PagedResponse<PublicBook>> = {}
): PagedResponse<PublicBook> => ({
  items: [],
  total: 1,
  current: 1,
  pageSize: 20,
  ...overrides,
});

// Serves whatever page is asked for, as the server does short of the end, so
// the hook never follows a `current` it did not ask for.
const serve = () =>
  mockedBooks.listBooks.mockImplementation(async (params = {}) =>
    pageOf({ current: params.current ?? 1 })
  );

const renderSearchPage = (
  route: string,
  queryClient: QueryClient = createTestQueryClient()
) => {
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[route]}>{children}</MemoryRouter>
    </QueryClientProvider>
  );
  Wrapper.displayName = 'SearchPageWrapper';
  const { result } = renderHook(
    () => ({ page: useSearchPage(), location: useLocation() }),
    { wrapper: Wrapper }
  );
  return {
    page: () => result.current.page,
    location: () =>
      result.current.location.pathname + result.current.location.search,
  };
};

const ready = (results: SearchResults) => {
  if (results.status !== 'ready') {
    throw new Error(`Results are ${results.status}`);
  }
  return results;
};

const whenLoaded = (page: () => SearchPageState) =>
  waitFor(() => expect(ready(page().results).books.isSuccess).toBe(true));

beforeEach(() => {
  jest.resetAllMocks();
  mockedGenres.listGenres.mockResolvedValue({
    items: [{ id: 4, name: 'Gothic' }],
  });
  serve();
});

describe('useSearchPage reading the URL', () => {
  it('searches the whole catalogue, most popular first, on a bare /search', async () => {
    const { page } = renderSearchPage('/search');

    await whenLoaded(page);
    expect(mockedBooks.listBooks).toHaveBeenCalledWith({
      sort: 'popular',
      current: 1,
      pageSize: 20,
    });
    expect(page().filterCount).toBe(0);
    expect(page().form.initialValues).toMatchObject({
      sort: 'popular',
      genre: undefined,
    });
    await waitFor(() =>
      expect(page().genres).toEqual([{ id: 4, name: 'Gothic' }])
    );
  });

  it('fills the form and the request from every field, days as instants', async () => {
    const { page } = renderSearchPage(
      '/search?q=dragon&status=complete&author=ann&seriesTitle=ash' +
        '&releasedFrom=2026-01-05&releasedTo=2026-01-10&sort=new&page=2'
    );

    await whenLoaded(page);
    expect(mockedBooks.listBooks).toHaveBeenCalledWith({
      q: 'dragon',
      author: 'ann',
      seriesTitle: 'ash',
      status: 'complete',
      releasedFrom: dayjs('2026-01-05').startOf('day').toISOString(),
      releasedTo: dayjs('2026-01-10').endOf('day').toISOString(),
      sort: 'new',
      current: 2,
      pageSize: 20,
    });
    const values = page().form.initialValues;
    expect(values).toMatchObject({
      q: 'dragon',
      author: 'ann',
      seriesTitle: 'ash',
      status: 'complete',
      sort: 'new',
    });
    expect(values.releasedFrom?.format('YYYY-MM-DD')).toBe('2026-01-05');
    expect(values.updatedFrom).toBeNull();
  });

  it('asks for a picked author or series by id and round-trips it through the form', async () => {
    const route =
      '/search?author=annlee&seriesTitle=Saga&authorId=3&seriesId=2';
    const { page, location } = renderSearchPage(route);

    await whenLoaded(page);
    expect(mockedBooks.listBooks).toHaveBeenCalledWith({
      userId: 3,
      seriesId: 2,
      sort: 'popular',
      current: 1,
      pageSize: 20,
    });
    expect(page().form.initialValues).toMatchObject({
      author: 'annlee',
      authorId: 3,
      seriesTitle: 'Saga',
      seriesId: 2,
    });

    act(() => page().form.onSearch(page().form.initialValues));

    expect(location()).toBe(route);
  });

  it('counts each filter once, a range as one, and not the sort', async () => {
    const plain = renderSearchPage('/search?sort=new');
    await whenLoaded(plain.page);
    expect(plain.page().filterCount).toBe(0);

    const filtered = renderSearchPage(
      '/search?q=a&status=complete&releasedFrom=2026-01-01' +
        '&releasedTo=2026-01-02&updatedTo=2026-01-03&sort=new'
    );
    await whenLoaded(filtered.page);
    expect(filtered.page().filterCount).toBe(4);
  });
});

describe('useSearchPage resolving the genre', () => {
  it('filters by a genre the list holds, filling the select and keying the form by it', async () => {
    const { page } = renderSearchPage('/search?genre=4');

    await whenLoaded(page);
    expect(mockedBooks.listBooks).toHaveBeenCalledWith(
      expect.objectContaining({ genreId: 4 })
    );
    expect(page().form.initialValues.genre).toBe(4);
    expect(page().form.key).toBe('genre=4|4');
  });

  it('waits for the genre list before asking for books', () => {
    mockedGenres.listGenres.mockReturnValue(new Promise<never>(() => {}));

    const { page } = renderSearchPage('/search?genre=4');

    expect(page().results).toEqual({ status: 'genre-loading' });
    expect(mockedBooks.listBooks).not.toHaveBeenCalled();
  });

  it.each(['99', 'abc'])(
    'reports genre %s gone, keeps the other fields and asks for no books',
    async (genre) => {
      const { page } = renderSearchPage(`/search?genre=${genre}&q=dragon`);

      await waitFor(() =>
        expect(page().results).toEqual({ status: 'genre-gone' })
      );
      expect(page().form.initialValues.q).toBe('dragon');
      expect(page().form.initialValues.genre).toBeUndefined();
      expect(mockedBooks.listBooks).not.toHaveBeenCalled();
    }
  );

  it('reports a genre list that failed, asking for no books', async () => {
    mockedGenres.listGenres.mockRejectedValue(new Error('Network down'));

    const { page } = renderSearchPage('/search?genre=4');

    await waitFor(() =>
      expect(page().results).toEqual({ status: 'genre-error' })
    );
    expect(mockedBooks.listBooks).not.toHaveBeenCalled();
  });
});

describe('useSearchPage correcting the page', () => {
  it('follows the server to the last non-empty page without a history entry', async () => {
    mockedBooks.listBooks.mockResolvedValue(pageOf({ current: 1 }));

    const { location } = renderSearchPage('/search?q=dragon&page=5');

    await waitFor(() => expect(location()).toBe('/search?q=dragon'));
  });

  it('ignores a cached page from the same search without a genre while the genre is blocked', async () => {
    const queryClient = createTestQueryClient();
    // Same search, minus the genre: `genreId: undefined` hashes the same as
    // no `genreId` key at all, so this collides with the blocked search's
    // own query key.
    queryClient.setQueryData(
      queryKeys.books({
        q: 'dragon',
        sort: 'popular',
        current: 3,
        pageSize: 20,
      }),
      pageOf({ current: 1 })
    );

    const { page, location } = renderSearchPage(
      '/search?q=dragon&genre=99&page=3',
      queryClient
    );

    await waitFor(() =>
      expect(page().results).toEqual({ status: 'genre-gone' })
    );
    expect(mockedBooks.listBooks).not.toHaveBeenCalled();
    expect(location()).toBe('/search?q=dragon&genre=99&page=3');
  });
});

describe('useSearchPage writing the URL', () => {
  it('starts a Search at page 1, trimming text and dropping empty fields', async () => {
    const { page, location } = renderSearchPage('/search?q=dragon&page=2');
    await whenLoaded(page);

    act(() =>
      page().form.onSearch({
        q: '  dragon ',
        author: 'ann',
        seriesTitle: '   ',
        genre: 4,
        releasedTo: dayjs('2026-01-10'),
        updatedFrom: null,
        sort: 'new',
      })
    );

    expect(location()).toBe(
      '/search?q=dragon&author=ann&genre=4&releasedTo=2026-01-10&sort=new'
    );
  });

  it('drops a picked id whose text was cleared', async () => {
    const { page, location } = renderSearchPage('/search?q=dragon');
    await whenLoaded(page);

    act(() =>
      page().form.onSearch({ author: ' ', authorId: 3, sort: 'popular' })
    );

    expect(location()).toBe('/search');
  });

  it('clears everything on Reset', async () => {
    const { page, location } = renderSearchPage('/search?q=dragon&sort=new');
    await whenLoaded(page);

    act(() => page().form.onReset());

    expect(location()).toBe('/search');
  });

  it('turns the page through the URL', async () => {
    const { page, location } = renderSearchPage('/search?q=dragon');
    await whenLoaded(page);

    act(() => ready(page().results).goToPage(2));

    expect(location()).toBe('/search?q=dragon&page=2');
  });
});

describe('useSearchPage placing a failure', () => {
  it("puts each issue of a 400 on the field it names, a picked id's on its text", async () => {
    mockedBooks.listBooks.mockRejectedValue(
      new ApiError(400, 'Request validation failed', [
        { path: ['author'], message: 'Too big' },
        { path: ['genreId'], message: 'Invalid input' },
        { path: ['userId'], message: 'Bad user' },
        { path: ['seriesId'], message: 'Bad series' },
        { path: ['current'], message: 'Too small' },
        { path: ['releasedFrom'], message: 'Must not be after the end date.' },
      ])
    );

    const { page } = renderSearchPage('/search?author=ann');

    await waitFor(() =>
      expect(page().form.fieldErrors).toEqual([
        { name: 'author', errors: ['Too big'] },
        { name: 'genre', errors: ['Invalid input'] },
        { name: 'author', errors: ['Bad user'] },
        { name: 'seriesTitle', errors: ['Bad series'] },
        { name: 'releasedFrom', errors: ['Must not be after the end date.'] },
      ])
    );
  });

  it.each([new ApiError(500, 'Boom'), new Error('Network down')])(
    'has nothing to place for %p',
    async (error) => {
      mockedBooks.listBooks.mockRejectedValue(error);

      const { page } = renderSearchPage('/search?author=ann');

      await waitFor(() =>
        expect(ready(page().results).books.isError).toBe(true)
      );
      expect(page().form.fieldErrors).toEqual([]);
    }
  );
});
