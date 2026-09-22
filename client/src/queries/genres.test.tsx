import { renderHook, waitFor } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import {
  useCreateGenre,
  useDeleteGenre,
  useGenres,
  useRenameGenre,
} from './genres';
import { createTestQueryClient } from '../test/queryClient';
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
      items: [{ id: 1, name: 'Gothic' }],
    });

    const { result } = renderHook(() => useGenres(), { wrapper: wrapper() });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });
    expect(result.current.data?.items).toEqual([{ id: 1, name: 'Gothic' }]);
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

describe('useCreateGenre', () => {
  it('creates and invalidates the genres, books and series caches', async () => {
    mockedGenres.createGenre.mockResolvedValue({ id: 5, name: 'Romance' });
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

describe('useRenameGenre', () => {
  it('renames the one id and invalidates all three caches', async () => {
    mockedGenres.renameGenre.mockResolvedValue({
      id: 1,
      name: 'Gothic Revival',
    });
    const client = createTestQueryClient();
    const invalidate = jest.spyOn(client, 'invalidateQueries');

    const { result } = renderHook(() => useRenameGenre(1), {
      wrapper: wrapper(client),
    });
    result.current.mutate({ name: 'Gothic Revival' });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockedGenres.renameGenre).toHaveBeenCalledWith(1, {
      name: 'Gothic Revival',
    });
    // A rename changes the `genre` embedded in every book and series a list
    // already holds, which is why books and series go too.
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['genres'] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['books'] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['series'] });
  });
});

describe('useDeleteGenre', () => {
  it('deletes the one id and invalidates all three caches', async () => {
    mockedGenres.deleteGenre.mockResolvedValue(undefined);
    const client = createTestQueryClient();
    const invalidate = jest.spyOn(client, 'invalidateQueries');

    const { result } = renderHook(() => useDeleteGenre(1), {
      wrapper: wrapper(client),
    });
    result.current.mutate();

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockedGenres.deleteGenre).toHaveBeenCalledWith(1);
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['genres'] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['books'] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['series'] });
  });
});
