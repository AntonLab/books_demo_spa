import { act } from '@testing-library/react';
import { useBookLibraryActions } from './library';
import { queryKeys } from './keys';
import { renderHookWithProviders } from '../test/renderWithProviders';
import { ApiError } from '../api/client';
import * as libraryApi from '../api/library';

jest.mock('../api/library');
const mockedLibrary = jest.mocked(libraryApi);

beforeEach(() => {
  jest.resetAllMocks();
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
