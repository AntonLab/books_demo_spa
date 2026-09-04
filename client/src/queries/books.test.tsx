import { renderHook, waitFor } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useBooks, useSearchBooks } from './books';
import { createTestQueryClient } from '../test/queryClient';
import * as booksApi from '../api/books';
import type { PublicBook } from '../types/book';

jest.mock('../api/books');

const mockedBooks = jest.mocked(booksApi);

const book: PublicBook = {
  id: 1,
  userId: 3,
  seriesId: null,
  description: 'A tale of dragons',
  tags: ['epic'],
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
