import { renderHook, waitFor } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import {
  useBookSearch,
  useDeleteBookCover,
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
