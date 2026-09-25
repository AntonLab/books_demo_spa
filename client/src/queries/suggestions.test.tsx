import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { SEARCH_TEXT_MAX_LENGTH } from 'shared';
import { useSuggestions } from './suggestions';
import { createTestQueryClient } from '../test/queryClient';
import * as booksApi from '../api/books';
import * as seriesApi from '../api/series';
import type { PublicSeries } from '../types/api';
import type { PublicBook } from '../types/book';

jest.mock('../api/books');
jest.mock('../api/series');

const mockedBooks = jest.mocked(booksApi);
const mockedSeries = jest.mocked(seriesApi);

const author = (id: number, login: string, name: string) => {
  const [firstName = '', lastName = ''] = name.split(' ');
  return { id, login, firstName, lastName, avatarUrl: null };
};

const bookOf = (
  id: number,
  title: string,
  authors: PublicBook['authors'] = []
): PublicBook => ({ id, title, authors }) as Partial<PublicBook> as PublicBook;

const seriesOf = (id: number, title: string): PublicSeries =>
  ({ id, title }) as PublicSeries;

const pageOf = (items: PublicBook[]) => ({
  items,
  total: items.length,
  current: 1,
  pageSize: 8,
});

const seriesPageOf = (items: PublicSeries[]) => ({
  items,
  total: items.length,
  limit: 8,
  offset: 0,
});

const wrapper = (client = createTestQueryClient()) => {
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  Wrapper.displayName = 'QueryClientWrapper';
  return Wrapper;
};

// All three kinds for one text, as the header search asks for them.
const renderAll = (text: string) =>
  renderHook(
    () => ({
      books: useSuggestions('books', text),
      authors: useSuggestions('authors', text),
      series: useSuggestions('series', text),
    }),
    { wrapper: wrapper() }
  );

// Lets a query that was going to start do so, which gives a "not called"
// assertion its meaning.
const settle = () => act(async () => {});

beforeEach(() => {
  jest.resetAllMocks();
  mockedBooks.listBooks.mockResolvedValue(pageOf([]));
  mockedSeries.listSeries.mockResolvedValue(seriesPageOf([]));
});

describe('useSuggestions', () => {
  it('asks for nothing under three characters, counted after trimming', async () => {
    renderAll('  dr  ');
    await settle();

    expect(mockedBooks.listBooks).not.toHaveBeenCalled();
    expect(mockedSeries.listSeries).not.toHaveBeenCalled();
  });

  it('asks for nothing past the length the server accepts, and asks at it', async () => {
    renderAll('x'.repeat(SEARCH_TEXT_MAX_LENGTH + 1));
    await settle();

    expect(mockedBooks.listBooks).not.toHaveBeenCalled();
    expect(mockedSeries.listSeries).not.toHaveBeenCalled();

    const longest = 'x'.repeat(SEARCH_TEXT_MAX_LENGTH);
    renderAll(longest);

    await waitFor(() => {
      expect(mockedSeries.listSeries).toHaveBeenCalledWith({
        q: longest,
        limit: 8,
      });
    });
  });

  it('asks each kind for the trimmed text, eight at most', async () => {
    renderAll('  drag  ');

    await waitFor(() => {
      expect(mockedSeries.listSeries).toHaveBeenCalledTimes(1);
    });
    expect(mockedSeries.listSeries).toHaveBeenCalledWith({
      q: 'drag',
      limit: 8,
    });
    expect(mockedBooks.listBooks).toHaveBeenCalledTimes(2);
    expect(mockedBooks.listBooks).toHaveBeenCalledWith({
      q: 'drag',
      pageSize: 8,
    });
    expect(mockedBooks.listBooks).toHaveBeenCalledWith({
      author: 'drag',
      pageSize: 8,
    });
  });

  it('asks only for the kind requested', async () => {
    const { result } = renderHook(() => useSuggestions('series', 'saga'), {
      wrapper: wrapper(),
    });

    await waitFor(() => {
      expect(result.current.isFetching).toBe(false);
    });
    expect(mockedSeries.listSeries).toHaveBeenCalledTimes(1);
    expect(mockedBooks.listBooks).not.toHaveBeenCalled();
  });

  it('drops a book found only by its description, ignoring case', async () => {
    mockedBooks.listBooks.mockResolvedValue(
      pageOf([bookOf(1, 'A Tale of Dragons'), bookOf(2, 'Unrelated')])
    );

    const { result } = renderHook(() => useSuggestions('books', 'drag'), {
      wrapper: wrapper(),
    });

    await waitFor(() => {
      expect(result.current.items).toEqual([bookOf(1, 'A Tale of Dragons')]);
    });
  });

  it('drops a series found only by its description', async () => {
    mockedSeries.listSeries.mockResolvedValue(
      seriesPageOf([seriesOf(2, 'The Dark Saga'), seriesOf(3, 'Unrelated')])
    );

    const { result } = renderHook(() => useSuggestions('series', 'saga'), {
      wrapper: wrapper(),
    });

    await waitFor(() => {
      expect(result.current.items).toEqual([seriesOf(2, 'The Dark Saga')]);
    });
  });

  it('offers the matching authors of the books found, once each', async () => {
    const ann = author(3, 'annlee', 'Ann Lee');
    const cora = author(4, 'cora', 'Cora Moss');
    const mira = author(5, 'mira', 'Leela Moss');
    mockedBooks.listBooks.mockResolvedValue(
      pageOf([bookOf(1, 'One', [ann, cora]), bookOf(2, 'Two', [ann, mira])])
    );

    const { result } = renderHook(() => useSuggestions('authors', 'lee'), {
      wrapper: wrapper(),
    });

    // Cora co-wrote a matched book but matches nothing herself; Ann wrote
    // both; Mira matches by first name only.
    await waitFor(() => {
      expect(result.current.items).toEqual([ann, mira]);
    });
    expect(mockedBooks.listBooks).toHaveBeenCalledWith({
      author: 'lee',
      pageSize: 8,
    });
  });

  it('reports fetching until the answer lands', async () => {
    let land: () => void = () => undefined;
    mockedSeries.listSeries.mockImplementation(
      () =>
        new Promise((resolve) => {
          land = () => resolve(seriesPageOf([seriesOf(2, 'The Dark Saga')]));
        })
    );

    const { result } = renderHook(() => useSuggestions('series', 'saga'), {
      wrapper: wrapper(),
    });

    await waitFor(() => {
      expect(result.current.isFetching).toBe(true);
    });
    expect(result.current.items).toEqual([]);

    act(() => land());

    await waitFor(() => {
      expect(result.current.isFetching).toBe(false);
    });
    expect(result.current.items).toEqual([seriesOf(2, 'The Dark Saga')]);
  });
});
