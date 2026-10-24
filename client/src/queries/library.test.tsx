import { act } from '@testing-library/react';
import {
  useBookLibraryActions,
  useReadingProgressMutation,
  useSeriesLibraryActions,
} from './library';
import { queryKeys } from './keys';
import { renderHookWithProviders } from '../test/renderWithProviders';
import { ApiError } from '../api/client';
import * as libraryApi from '../api/library';

jest.mock('../api/library');
const mockedLibrary = jest.mocked(libraryApi);

beforeEach(() => {
  jest.resetAllMocks();
});

describe('useSeriesLibraryActions', () => {
  it('refreshes the Series, the books and the Library after a write succeeds', async () => {
    mockedLibrary.addSeriesToLibrary.mockResolvedValue({
      inLibrary: true,
      notInterested: false,
    });
    const { result, queryClient } = renderHookWithProviders(() =>
      useSeriesLibraryActions(12)
    );
    const invalidate = jest.spyOn(queryClient, 'invalidateQueries');

    await act(() => result.current.add.mutateAsync());

    expect(invalidate).toHaveBeenCalledWith({
      queryKey: queryKeys.seriesDetail(12),
    });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: queryKeys.allBooks });
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: queryKeys.allLibrary,
    });
  });
});

describe('useReadingProgressMutation', () => {
  it('refreshes only the Book and the Library after an opened event', async () => {
    mockedLibrary.postReadingProgress.mockResolvedValue(undefined);
    const { result, queryClient } = renderHookWithProviders(() =>
      useReadingProgressMutation()
    );
    const invalidate = jest.spyOn(queryClient, 'invalidateQueries');

    await act(() =>
      result.current.mutateAsync({
        bookId: 7,
        payload: { event: 'opened', chapterId: 3 },
      })
    );

    expect(invalidate).toHaveBeenCalledTimes(2);
    expect(invalidate).toHaveBeenCalledWith({ queryKey: queryKeys.book(7) });
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: queryKeys.allLibrary,
    });
  });

  it('refreshes every book list and the Library after a finished event', async () => {
    mockedLibrary.postReadingProgress.mockResolvedValue(undefined);
    const { result, queryClient } = renderHookWithProviders(() =>
      useReadingProgressMutation()
    );
    const invalidate = jest.spyOn(queryClient, 'invalidateQueries');

    await act(() =>
      result.current.mutateAsync({
        bookId: 7,
        payload: { event: 'finished', chapterId: 3 },
      })
    );

    expect(invalidate).toHaveBeenCalledTimes(2);
    expect(invalidate).toHaveBeenCalledWith({ queryKey: queryKeys.allBooks });
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: queryKeys.allLibrary,
    });
  });
});

describe('useBookLibraryActions', () => {
  it('removes a Book, then refreshes the books and the Library', async () => {
    mockedLibrary.clearReadingStatus.mockResolvedValue(undefined);
    const { result, queryClient } = renderHookWithProviders(() =>
      useBookLibraryActions()
    );
    const invalidate = jest.spyOn(queryClient, 'invalidateQueries');

    await act(() => result.current.remove.mutateAsync(7));

    expect(mockedLibrary.clearReadingStatus).toHaveBeenCalledWith(7);
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['books'] });
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: queryKeys.allLibrary,
    });
  });

  it.each([
    ['add', 'addBookToLibrary'],
    ['toggleNotInterested', 'toggleBookNotInterested'],
  ] as const)(
    'refreshes the books and the Library after %s succeeds',
    async (action, apiName) => {
      mockedLibrary[apiName].mockResolvedValue({ bookId: 7, status: null });
      const { result, queryClient } = renderHookWithProviders(() =>
        useBookLibraryActions()
      );
      const invalidate = jest.spyOn(queryClient, 'invalidateQueries');

      await act(() => result.current[action].mutateAsync(7));

      expect(invalidate).toHaveBeenCalledWith({ queryKey: ['books'] });
      expect(invalidate).toHaveBeenCalledWith({
        queryKey: queryKeys.allLibrary,
      });
    }
  );

  it('refreshes even when the write fails, so the screen shows what exists', async () => {
    mockedLibrary.clearReadingStatus.mockRejectedValue(
      new ApiError(404, 'Book 7 not found')
    );
    const { result, queryClient } = renderHookWithProviders(() =>
      useBookLibraryActions()
    );
    const invalidate = jest.spyOn(queryClient, 'invalidateQueries');

    await act(async () => {
      await expect(result.current.remove.mutateAsync(7)).rejects.toMatchObject({
        status: 404,
      });
    });

    expect(invalidate).toHaveBeenCalledWith({
      queryKey: queryKeys.allLibrary,
    });
  });
});
