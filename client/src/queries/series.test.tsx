import { waitFor } from '@testing-library/react';
import { ApiError } from '../api/client';
import {
  useDeleteSeries,
  useDeleteSeriesCover,
  useFavoritedSeries,
  useSeriesList,
  useUploadSeriesCover,
} from './series';
import type { PublicSeries } from '../types/api';
import { renderHookWithProviders } from '../test/renderWithProviders';
import * as seriesApi from '../api/series';

jest.mock('../api/series');
const mockedSeries = jest.mocked(seriesApi);

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
    mockedSeries.uploadSeriesCover.mockResolvedValue({} as PublicSeries);
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
