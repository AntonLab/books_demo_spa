import { renderHook, waitFor } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import {
  useBooks,
  useDeleteBookCover,
  useSearchBooks,
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

describe('useBooks', () => {
  it('fetches the first page', async () => {
    mockedBooks.listBooks.mockResolvedValue({
      items: [book],
      total: 1,
      limit: 20,
      offset: 0,
    });

    const { result } = renderHook(() => useBooks(), { wrapper: wrapper() });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });
    expect(result.current.data?.items).toEqual([book]);
    expect(mockedBooks.listBooks).toHaveBeenCalledWith({ limit: 20 });
  });

  it('surfaces a failure as an error rather than throwing', async () => {
    mockedBooks.listBooks.mockRejectedValue(new Error('Network down'));

    const { result } = renderHook(() => useBooks(), { wrapper: wrapper() });

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });
    expect(result.current.error?.message).toBe('Network down');
  });
});

describe('useSearchBooks', () => {
  it('passes the term through to the API', async () => {
    mockedBooks.listBooks.mockResolvedValue({
      items: [book],
      total: 1,
      limit: 20,
      offset: 0,
    });

    const { result } = renderHook(() => useSearchBooks('dragon'), {
      wrapper: wrapper(),
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });
    expect(mockedBooks.listBooks).toHaveBeenCalledWith({
      q: 'dragon',
      limit: 20,
    });
  });

  it('does not hit the network for a blank term', () => {
    renderHook(() => useSearchBooks(''), { wrapper: wrapper() });

    expect(mockedBooks.listBooks).not.toHaveBeenCalled();
  });

  it('stays pending with an idle fetch while disabled', () => {
    const { result } = renderHook(() => useSearchBooks(''), {
      wrapper: wrapper(),
    });

    // This is why SearchPage's early return on a blank term is load-bearing
    // rather than cosmetic: a disabled query reports isPending forever, so
    // rendering BookList here would show an endless skeleton.
    expect(result.current.isPending).toBe(true);
    expect(result.current.fetchStatus).toBe('idle');
  });

  it('caches each term separately, so a search cannot clobber the list', async () => {
    mockedBooks.listBooks.mockResolvedValue({
      items: [book],
      total: 1,
      limit: 20,
      offset: 0,
    });
    const client = createTestQueryClient();
    const wrap = wrapper(client);

    const list = renderHook(() => useBooks(), { wrapper: wrap });
    await waitFor(() => {
      expect(list.result.current.isSuccess).toBe(true);
    });

    const search = renderHook(() => useSearchBooks('dragon'), {
      wrapper: wrap,
    });
    await waitFor(() => {
      expect(search.result.current.isSuccess).toBe(true);
    });

    // Two entries, not one overwritten twice. searchSlice existed as its own
    // slice to guarantee exactly this; the cache keys guarantee it now.
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
  });
});
