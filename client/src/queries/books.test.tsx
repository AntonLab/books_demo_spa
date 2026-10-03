import { renderHook, waitFor } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { ApiError } from '../api/client';
import {
  useBookSearch,
  useDeleteBook,
  useDeleteBookCover,
  useFavoritedBooks,
  useRecentlyViewedBooks,
  useSortedBooks,
  useUploadBookCover,
} from './books';
import { createTestQueryClient } from '../test/queryClient';
import * as booksApi from '../api/books';
import type { PublicBook } from '../types/book';

jest.mock('../api/books');

const mockedBooks = jest.mocked(booksApi);

const book: PublicBook = {
  id: 1,
  authors: [
    {
      id: 3,
      login: 'Author',
      firstName: 'Ann',
      lastName: 'Author',
      avatarUrl: null,
    },
  ],
  seriesId: null,
  series: null,
  title: 'A Tale of Dragons',
  description: 'A tale of dragons',
  tags: ['epic'],
  status: 'in_progress',
  genre: null,
  coverUrl: null,
  createdAt: '2026-09-01T00:00:00.000Z',
  updatedAt: '2026-09-01T00:00:00.000Z',
};

const wrapper = (client = createTestQueryClient()) => {
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  Wrapper.displayName = 'QueryClientWrapper';
  return Wrapper;
};

beforeEach(() => {
  jest.resetAllMocks();
});

describe('useSortedBooks', () => {
  it('fetches the first page in the ranking asked for', async () => {
    mockedBooks.listBooks.mockResolvedValue({
      items: [book],
      total: 1,
      current: 1,
      pageSize: 20,
    });

    const { result } = renderHook(() => useSortedBooks('new'), {
      wrapper: wrapper(),
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });
    expect(result.current.data?.items).toEqual([book]);
    expect(mockedBooks.listBooks).toHaveBeenCalledWith({
      sort: 'new',
      pageSize: 20,
    });
  });

  it('keeps a shorter list apart from the full page', async () => {
    mockedBooks.listBooks.mockResolvedValue({
      items: [book],
      total: 1,
      current: 1,
      pageSize: 6,
    });
    const client = createTestQueryClient();
    const wrap = wrapper(client);

    const short = renderHook(() => useSortedBooks('popular', 6), {
      wrapper: wrap,
    });
    await waitFor(() => expect(short.result.current.isSuccess).toBe(true));
    const full = renderHook(() => useSortedBooks('popular'), { wrapper: wrap });
    await waitFor(() => expect(full.result.current.isSuccess).toBe(true));

    expect(mockedBooks.listBooks).toHaveBeenCalledWith({
      sort: 'popular',
      pageSize: 6,
    });
    expect(client.getQueryCache().getAll()).toHaveLength(2);
  });

  it('surfaces a failure as an error rather than throwing', async () => {
    mockedBooks.listBooks.mockRejectedValue(new Error('Network down'));

    const { result } = renderHook(() => useSortedBooks('updated'), {
      wrapper: wrapper(),
    });

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });
    expect(result.current.error?.message).toBe('Network down');
  });
});

describe('useRecentlyViewedBooks', () => {
  const titled = (id: number): PublicBook => ({
    ...book,
    id,
    title: `Book ${id}`,
  });

  it('asks for the ids as a set and orders the answer by history', async () => {
    mockedBooks.listBooks.mockResolvedValue({
      items: [titled(1), titled(2), titled(3)],
      total: 3,
      current: 1,
      pageSize: 20,
    });

    const { result } = renderHook(() => useRecentlyViewedBooks([3, 1, 2]), {
      wrapper: wrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.map((item) => item.id)).toEqual([3, 1, 2]);
    expect(mockedBooks.listBooks).toHaveBeenCalledWith({
      ids: '1,2,3',
      pageSize: 20,
    });
  });

  it('skips ids the server dropped and keeps the first six that came back', async () => {
    const history = [20, 19, 18, 17, 16, 15, 14, 13, 12];
    mockedBooks.listBooks.mockResolvedValue({
      // 19 dropped out (unpublished): the seventh id fills its place.
      items: history.filter((id) => id !== 19).map(titled),
      total: 8,
      current: 1,
      pageSize: 20,
    });

    const { result } = renderHook(() => useRecentlyViewedBooks(history), {
      wrapper: wrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.map((item) => item.id)).toEqual([
      20, 18, 17, 16, 15, 14,
    ]);
  });

  it('reorders without a new request when only the history order changes', async () => {
    mockedBooks.listBooks.mockResolvedValue({
      items: [titled(1), titled(2)],
      total: 2,
      current: 1,
      pageSize: 20,
    });
    const wrap = wrapper();

    const { result, rerender } = renderHook(
      ({ ids }) => useRecentlyViewedBooks(ids),
      { wrapper: wrap, initialProps: { ids: [2, 1] } }
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    rerender({ ids: [1, 2] });

    expect(result.current.data?.map((item) => item.id)).toEqual([1, 2]);
    expect(mockedBooks.listBooks).toHaveBeenCalledTimes(1);
  });

  it('makes no request for an empty history', () => {
    renderHook(() => useRecentlyViewedBooks([]), { wrapper: wrapper() });

    expect(mockedBooks.listBooks).not.toHaveBeenCalled();
  });
});

describe('useBookSearch', () => {
  const page = { items: [book], total: 1, current: 1, pageSize: 20 };

  it('asks for the page of the search it is given', async () => {
    mockedBooks.listBooks.mockResolvedValue(page);

    const { result } = renderHook(
      () => useBookSearch({ q: 'dragon', current: 2, pageSize: 20 }, true),
      { wrapper: wrapper() }
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockedBooks.listBooks).toHaveBeenCalledWith({
      q: 'dragon',
      current: 2,
      pageSize: 20,
    });
  });

  it('asks nothing while disabled', () => {
    const { result } = renderHook(() => useBookSearch({ genreId: 4 }, false), {
      wrapper: wrapper(),
    });

    // A disabled query reports isPending forever: SearchPage must not render
    // CardList for it.
    expect(result.current.fetchStatus).toBe('idle');
    expect(mockedBooks.listBooks).not.toHaveBeenCalled();
  });

  it('keeps a search apart from the ranked list', async () => {
    mockedBooks.listBooks.mockResolvedValue({
      items: [book],
      total: 1,
      current: 1,
      pageSize: 20,
    });
    const client = createTestQueryClient();
    const wrap = wrapper(client);

    const list = renderHook(() => useSortedBooks('popular'), { wrapper: wrap });
    await waitFor(() => expect(list.result.current.isSuccess).toBe(true));
    const search = renderHook(
      () => useBookSearch({ q: 'dragon', pageSize: 20 }, true),
      { wrapper: wrap }
    );
    await waitFor(() => expect(search.result.current.isSuccess).toBe(true));

    expect(client.getQueryCache().getAll()).toHaveLength(2);
  });
});

describe('useUploadBookCover', () => {
  it('uploads and invalidates the books and series caches', async () => {
    mockedBooks.uploadBookCover.mockResolvedValue({
      ...book,
      coverUrl: '/api/books/1/cover?v=2',
    });
    const client = createTestQueryClient();
    const invalidate = jest.spyOn(client, 'invalidateQueries');
    const file = new File([new Uint8Array([1])], 'a.webp', {
      type: 'image/webp',
    });

    const { result } = renderHook(() => useUploadBookCover(1), {
      wrapper: wrapper(client),
    });
    result.current.mutate(file);

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockedBooks.uploadBookCover).toHaveBeenCalledWith(1, file);
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['books'] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['series'] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['genres'] });
  });
});

describe('useDeleteBookCover', () => {
  it('deletes and invalidates the books and series caches', async () => {
    mockedBooks.deleteBookCover.mockResolvedValue(undefined);
    const client = createTestQueryClient();
    const invalidate = jest.spyOn(client, 'invalidateQueries');

    const { result } = renderHook(() => useDeleteBookCover(1), {
      wrapper: wrapper(client),
    });
    result.current.mutate();

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockedBooks.deleteBookCover).toHaveBeenCalledWith(1);
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['books'] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['series'] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['genres'] });
  });
});

describe('useDeleteBook', () => {
  it('refreshes the lists after a failed delete too, as the book may be gone already', async () => {
    mockedBooks.deleteBook.mockRejectedValue(new ApiError(404, 'gone'));
    const client = createTestQueryClient();
    const invalidate = jest.spyOn(client, 'invalidateQueries');
    const { result } = renderHook(() => useDeleteBook(7), {
      wrapper: wrapper(client),
    });

    result.current.mutate();

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['books'] });
  });
});

describe('useFavoritedBooks', () => {
  const page = {
    items: [{ ...book, favoriteId: 11 }],
    total: 1,
    current: 1,
    pageSize: 20,
  };

  it('asks the favorited list, cached apart from the same search over all books', async () => {
    mockedBooks.listFavoritedBooks.mockResolvedValue(page);
    const client = createTestQueryClient();

    const { result } = renderHook(() => useFavoritedBooks({ q: 'x' }, true), {
      wrapper: wrapper(client),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockedBooks.listFavoritedBooks).toHaveBeenCalledWith({ q: 'x' });
    expect(client.getQueryData(['books', { q: 'x' }])).toBeUndefined();
    expect(
      client.getQueryData(['books', { q: 'x', favoritedBy: 'me' }])
    ).toEqual(page);
  });
});
