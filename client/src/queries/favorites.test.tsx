import { act, waitFor } from '@testing-library/react';
import {
  useFavoriteBooks,
  useRemoveFavorite,
  useToggleFavorite,
} from './favorites';
import { queryKeys } from './keys';
import { renderHookWithProviders } from '../test/renderWithProviders';
import { ApiError } from '../api/client';
import * as favoritesApi from '../api/favorites';

jest.mock('../api/favorites');
const mockedFavorites = jest.mocked(favoritesApi);

const favorite = {
  id: 5,
  userId: 9,
  bookId: 7,
  seriesId: null,
  createdAt: '2026-09-26T10:00:00.000Z',
};

beforeEach(() => {
  jest.resetAllMocks();
});

describe('useToggleFavorite', () => {
  it('adds when the viewer holds no Favorite, and refreshes the work and the lists', async () => {
    mockedFavorites.createFavorite.mockResolvedValue(favorite);
    const { result, queryClient } = renderHookWithProviders(() =>
      useToggleFavorite(queryKeys.book(7))
    );
    const invalidate = jest.spyOn(queryClient, 'invalidateQueries');

    await act(() =>
      result.current.mutateAsync({ existingId: null, payload: { bookId: 7 } })
    );

    expect(mockedFavorites.createFavorite).toHaveBeenCalledWith({ bookId: 7 });
    expect(mockedFavorites.deleteFavorite).not.toHaveBeenCalled();
    expect(invalidate).toHaveBeenCalledWith({ queryKey: queryKeys.book(7) });
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: queryKeys.allFavorites,
    });
  });

  it('removes the Favorite the viewer holds', async () => {
    mockedFavorites.deleteFavorite.mockResolvedValue(undefined);
    const { result } = renderHookWithProviders(() =>
      useToggleFavorite(queryKeys.seriesDetail(12))
    );

    await act(() =>
      result.current.mutateAsync({ existingId: 5, payload: { seriesId: 12 } })
    );

    expect(mockedFavorites.deleteFavorite).toHaveBeenCalledWith(5);
    expect(mockedFavorites.createFavorite).not.toHaveBeenCalled();
  });

  it('refreshes the work after a refusal too, since a 409 means the page is stale', async () => {
    mockedFavorites.createFavorite.mockRejectedValue(
      new ApiError(409, 'favorite is already taken')
    );
    const { result, queryClient } = renderHookWithProviders(() =>
      useToggleFavorite(queryKeys.book(7))
    );
    const invalidate = jest.spyOn(queryClient, 'invalidateQueries');

    act(() => {
      result.current.mutate({ existingId: null, payload: { bookId: 7 } });
    });

    await waitFor(() =>
      expect(invalidate).toHaveBeenCalledWith({ queryKey: queryKeys.book(7) })
    );
  });
});

describe('useFavoriteBooks', () => {
  it('asks for the page and size it is given', async () => {
    mockedFavorites.listFavoriteBooks.mockResolvedValue({
      items: [],
      total: 41,
      limit: 20,
      offset: 40,
    });

    const { result } = renderHookWithProviders(() => useFavoriteBooks(3, 20));

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockedFavorites.listFavoriteBooks).toHaveBeenCalledWith({
      limit: 20,
      offset: 40,
    });
  });
});

describe('useRemoveFavorite', () => {
  it('removes by the Favorite’s id and refreshes the lists, books and series', async () => {
    mockedFavorites.deleteFavorite.mockResolvedValue(undefined);
    const { result, queryClient } = renderHookWithProviders(() =>
      useRemoveFavorite()
    );
    const invalidate = jest.spyOn(queryClient, 'invalidateQueries');

    await act(() => result.current.mutateAsync(5));

    expect(mockedFavorites.deleteFavorite).toHaveBeenCalledWith(5);
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: queryKeys.allFavorites,
    });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['books'] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['series'] });
  });
});
