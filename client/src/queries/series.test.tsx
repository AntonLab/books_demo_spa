import { waitFor } from '@testing-library/react';
import { useFavoritedSeries, useSeriesList } from './series';
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
