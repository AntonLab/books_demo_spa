import { act } from '@testing-library/react';
import { useSetReadingStatus } from './library';
import { queryKeys } from './keys';
import { renderHookWithProviders } from '../test/renderWithProviders';
import { ApiError } from '../api/client';
import * as libraryApi from '../api/library';

jest.mock('../api/library');
const mockedLibrary = jest.mocked(libraryApi);

beforeEach(() => {
  jest.resetAllMocks();
});

describe('useSetReadingStatus', () => {
  it('sets a status, then refreshes the books and the Library', async () => {
    mockedLibrary.setReadingStatus.mockResolvedValue({
      bookId: 7,
      status: 'read',
      updatedAt: '2026-10-02T10:00:00.000Z',
    });
    const { result, queryClient } = renderHookWithProviders(() =>
      useSetReadingStatus()
    );
    const invalidate = jest.spyOn(queryClient, 'invalidateQueries');

    await act(() => result.current.mutateAsync({ bookId: 7, status: 'read' }));

    expect(mockedLibrary.setReadingStatus).toHaveBeenCalledWith(7, 'read');
    expect(mockedLibrary.clearReadingStatus).not.toHaveBeenCalled();
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['books'] });
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: queryKeys.allLibrary,
    });
  });

  it('clears when the status is null', async () => {
    mockedLibrary.clearReadingStatus.mockResolvedValue(undefined);
    const { result } = renderHookWithProviders(() => useSetReadingStatus());

    await act(() => result.current.mutateAsync({ bookId: 7, status: null }));

    expect(mockedLibrary.clearReadingStatus).toHaveBeenCalledWith(7);
  });

  it('refreshes even when the write fails, so the screen shows what exists', async () => {
    mockedLibrary.setReadingStatus.mockRejectedValue(
      new ApiError(404, 'Book 7 not found')
    );
    const { result, queryClient } = renderHookWithProviders(() =>
      useSetReadingStatus()
    );
    const invalidate = jest.spyOn(queryClient, 'invalidateQueries');

    await act(async () => {
      await expect(
        result.current.mutateAsync({ bookId: 7, status: 'read' })
      ).rejects.toMatchObject({ status: 404 });
    });

    expect(invalidate).toHaveBeenCalledWith({
      queryKey: queryKeys.allLibrary,
    });
  });
});
