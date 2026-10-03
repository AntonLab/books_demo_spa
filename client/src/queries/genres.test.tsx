import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import {
  useCreateGenre,
  useDeleteGenre,
  useGenres,
  useGenresCounts,
  useGenresWithBooks,
  useUpdateGenre,
} from './genres';
import { queryKeys } from './keys';
import { createTestQueryClient } from '../test/queryClient';
import { adminGenre, genreItem, publicGenre } from '../test/genres';
import * as genresApi from '../api/genres';

jest.mock('../api/genres');

const mockedGenres = jest.mocked(genresApi);

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

describe('useGenres', () => {
  it('fetches the whole list', async () => {
    mockedGenres.listGenres.mockResolvedValue({
      items: [genreItem(1, 'Gothic')],
    });

    const { result } = renderHook(() => useGenres(), { wrapper: wrapper() });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });
    expect(result.current.data?.items).toEqual([genreItem(1, 'Gothic')]);
    expect(mockedGenres.listGenres).toHaveBeenCalledTimes(1);
  });

  it('surfaces a failure as an error rather than throwing', async () => {
    mockedGenres.listGenres.mockRejectedValue(new Error('Network down'));

    const { result } = renderHook(() => useGenres(), { wrapper: wrapper() });

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });
    expect(result.current.error?.message).toBe('Network down');
  });
});

describe('useGenresWithBooks', () => {
  it('asks only for the genres with a published book, in its own cache entry', async () => {
    mockedGenres.listGenres.mockResolvedValue({
      items: [genreItem(1, 'Gothic')],
    });
    const client = createTestQueryClient();

    const { result } = renderHook(() => useGenresWithBooks(), {
      wrapper: wrapper(client),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockedGenres.listGenres).toHaveBeenCalledWith({ nonEmpty: true });
    expect(client.getQueryData(['genres', { nonEmpty: true }])).toEqual({
      items: [genreItem(1, 'Gothic')],
    });
  });
});

describe('useGenresCounts', () => {
  it('asks for the counts in its own cache entry under the genres prefix', async () => {
    mockedGenres.listGenreCounts.mockResolvedValue({
      items: [adminGenre(1, 'Fantasy', null, 2, 1)],
    });
    const client = createTestQueryClient();

    const { result } = renderHook(() => useGenresCounts(), {
      wrapper: wrapper(client),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.items[0]).toMatchObject({ bookCount: 2 });
    expect(client.getQueryData(queryKeys.genresCounts)).toBeDefined();
    expect(mockedGenres.listGenres).not.toHaveBeenCalled();
  });
});

describe('useUpdateGenre', () => {
  it('sends the payload for its id and invalidates genres, counts, books and series', async () => {
    mockedGenres.updateGenre.mockResolvedValue(
      publicGenre(2, 'Urban Fantasy', { id: 1, name: 'Fantasy' })
    );
    const client = createTestQueryClient();
    client.setQueryData(queryKeys.genresCounts, { items: [] });
    client.setQueryData(['books', 1], {});
    client.setQueryData(['series', 1], {});
    const { result } = renderHook(() => useUpdateGenre(), {
      wrapper: wrapper(client),
    });

    await act(async () => {
      await result.current.mutateAsync({ id: 2, payload: { parentId: 1 } });
    });

    expect(mockedGenres.updateGenre).toHaveBeenCalledWith(2, { parentId: 1 });
    for (const key of [queryKeys.genresCounts, ['books', 1], ['series', 1]]) {
      expect(client.getQueryState(key)?.isInvalidated).toBe(true);
    }
  });
});

describe('useCreateGenre', () => {
  it('creates and invalidates the genres, books and series caches', async () => {
    mockedGenres.createGenre.mockResolvedValue(publicGenre(5, 'Romance'));
    const client = createTestQueryClient();
    const invalidate = jest.spyOn(client, 'invalidateQueries');

    const { result } = renderHook(() => useCreateGenre(), {
      wrapper: wrapper(client),
    });
    result.current.mutate({ name: 'Romance' });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    // Exactly one argument: a mutationFn passed by reference would also get
    // TanStack's internal context object.
    expect(mockedGenres.createGenre).toHaveBeenCalledWith({ name: 'Romance' });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['genres'] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['books'] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['series'] });
  });
});

describe('useDeleteGenre', () => {
  it('deletes the id it is given and invalidates all three caches', async () => {
    mockedGenres.deleteGenre.mockResolvedValue(undefined);
    const client = createTestQueryClient();
    const invalidate = jest.spyOn(client, 'invalidateQueries');

    const { result } = renderHook(() => useDeleteGenre(), {
      wrapper: wrapper(client),
    });
    result.current.mutate(1);

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockedGenres.deleteGenre).toHaveBeenCalledWith(1);
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['genres'] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['books'] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['series'] });
  });
});
