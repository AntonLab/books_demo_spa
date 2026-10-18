import { act, waitFor } from '@testing-library/react';
import { ApiError } from '../api/client';
import { useBooksInSeries } from './books';
import {
  useDeleteSeries,
  useDeleteSeriesCover,
  useFavoritedSeries,
  useReorderSeriesBooks,
  useSeriesList,
  useUploadSeriesCover,
} from './series';
import { queryKeys } from './keys';
import { publicSeries } from '../test/works';
import { renderHookWithProviders } from '../test/renderWithProviders';
import * as booksApi from '../api/books';
import * as seriesApi from '../api/series';

jest.mock('../api/series');
jest.mock('../api/books');
const mockedSeries = jest.mocked(seriesApi);
const mockedBooks = jest.mocked(booksApi);

const body = { items: [], total: 0, limit: 20, offset: 0 };

beforeEach(() => {
  jest.resetAllMocks();
});

describe('useSeriesList', () => {
  it('asks for the params it is given, and nothing while disabled', async () => {
    mockedSeries.listSeries.mockResolvedValue(body);
    renderHookWithProviders(() => useSeriesList({ limit: 5 }, false));
    const { result } = renderHookWithProviders(() =>
      useSeriesList({ userId: 3, limit: 20 }, true)
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockedSeries.listSeries).toHaveBeenCalledTimes(1);
    expect(mockedSeries.listSeries).toHaveBeenCalledWith({
      userId: 3,
      limit: 20,
    });
  });
});

describe('useDeleteSeries', () => {
  it('refreshes the lists after a failed delete too', async () => {
    mockedSeries.deleteSeries.mockRejectedValue(new ApiError(404, 'gone'));

    const { result, queryClient } = renderHookWithProviders(() =>
      useDeleteSeries(12)
    );
    const invalidate = jest.spyOn(queryClient, 'invalidateQueries');

    result.current.mutate();

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['series'] });
  });
});

describe('useReorderSeriesBooks', () => {
  const grid = { items: [], total: 0, current: 1, pageSize: 100 };

  it.each([
    [
      'saves',
      () => mockedSeries.reorderSeriesBooks.mockResolvedValue(undefined),
    ],
    [
      'is refused with a 409',
      () =>
        mockedSeries.reorderSeriesBooks.mockRejectedValue(
          new ApiError(
            409,
            'The books of this series changed since you loaded them'
          )
        ),
    ],
  ])(
    'refetches the Series page grid and the series books after a reorder that %s',
    async (_label, arrange) => {
      arrange();
      mockedBooks.listBooks.mockResolvedValue(grid);
      const { result, queryClient } = renderHookWithProviders(() => ({
        grid: useBooksInSeries(3),
        reorder: useReorderSeriesBooks(3),
      }));
      await waitFor(() => expect(result.current.grid.isSuccess).toBe(true));
      expect(mockedBooks.listBooks).toHaveBeenCalledTimes(1);
      const invalidate = jest.spyOn(queryClient, 'invalidateQueries');

      await act(() =>
        result.current.reorder.mutateAsync([2, 1]).catch(() => undefined)
      );

      await waitFor(() =>
        expect(mockedBooks.listBooks).toHaveBeenCalledTimes(2)
      );
      expect(invalidate).toHaveBeenCalledTimes(2);
      expect(invalidate).toHaveBeenCalledWith({
        queryKey: queryKeys.seriesBooks(3),
      });
      expect(invalidate).toHaveBeenCalledWith({ queryKey: queryKeys.allBooks });
    }
  );

  it('puts the old order back in the cache when the save fails for any reason but a 409', async () => {
    mockedSeries.reorderSeriesBooks.mockRejectedValue(
      new ApiError(500, 'Internal Server Error')
    );
    const { result, queryClient } = renderHookWithProviders(() =>
      useReorderSeriesBooks(3)
    );
    const rows = [{ id: 1 }, { id: 2 }];
    queryClient.setQueryData(queryKeys.seriesBooks(3), { items: rows });

    await act(() => result.current.mutateAsync([2, 1]).catch(() => undefined));

    expect(queryClient.getQueryData(queryKeys.seriesBooks(3))).toEqual({
      items: rows,
    });
  });
});

describe('useFavoritedSeries', () => {
  it('asks the favorited list, cached under favoritedBy', async () => {
    mockedSeries.listFavoritedSeries.mockResolvedValue(body);

    const { result, queryClient } = renderHookWithProviders(() =>
      useFavoritedSeries({ tag: 'a' }, true)
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockedSeries.listFavoritedSeries).toHaveBeenCalledWith({ tag: 'a' });
    expect(queryClient.getQueryData(['series', { tag: 'a' }])).toBeUndefined();
    expect(
      queryClient.getQueryData(['series', { tag: 'a', favoritedBy: 'me' }])
    ).toEqual(body);
  });
});

describe('useUploadSeriesCover / useDeleteSeriesCover', () => {
  it('upload calls the API and invalidates the series and books caches', async () => {
    mockedSeries.uploadSeriesCover.mockResolvedValue(publicSeries());
    const { result, queryClient } = renderHookWithProviders(() =>
      useUploadSeriesCover(12)
    );
    const invalidate = jest.spyOn(queryClient, 'invalidateQueries');
    const file = new File([new Uint8Array([1])], 'a.webp', {
      type: 'image/webp',
    });

    result.current.mutate(file);

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockedSeries.uploadSeriesCover).toHaveBeenCalledWith(12, file);
    expect(invalidate).toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: ['series'] })
    );
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['books'] });
  });

  it('delete calls the API and invalidates the same caches', async () => {
    mockedSeries.deleteSeriesCover.mockResolvedValue(undefined);
    const { result, queryClient } = renderHookWithProviders(() =>
      useDeleteSeriesCover(12)
    );
    const invalidate = jest.spyOn(queryClient, 'invalidateQueries');

    result.current.mutate();

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockedSeries.deleteSeriesCover).toHaveBeenCalledWith(12);
    expect(invalidate).toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: ['series'] })
    );
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['books'] });
  });
});
