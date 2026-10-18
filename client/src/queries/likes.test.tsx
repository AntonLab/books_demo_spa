import { act, waitFor } from '@testing-library/react';
import { useToggleLike } from './likes';
import { queryKeys } from './keys';
import { renderHookWithProviders } from '../test/renderWithProviders';
import { ApiError } from '../api/client';
import * as likesApi from '../api/likes';

jest.mock('../api/likes');
const mockedLikes = jest.mocked(likesApi);

const like = {
  id: 5,
  userId: 9,
  bookId: 7,
  commentId: null,
  isLike: true,
  createdAt: '2026-09-26T10:00:00.000Z',
};
const payload = { bookId: 7, isLike: true };

beforeEach(() => {
  jest.resetAllMocks();
});

const setUp = () => {
  const hook = renderHookWithProviders(() =>
    useToggleLike(queryKeys.comments(7))
  );
  const invalidate = jest.spyOn(hook.queryClient, 'invalidateQueries');
  return { result: hook.result, invalidate };
};

describe('useToggleLike', () => {
  it('likes when the viewer holds no like, and refreshes the passed key once', async () => {
    mockedLikes.createLike.mockResolvedValue(like);
    const { result, invalidate } = setUp();

    await act(() => result.current.mutateAsync({ existingId: null, payload }));

    expect(mockedLikes.createLike).toHaveBeenCalledWith(payload);
    expect(mockedLikes.deleteLike).not.toHaveBeenCalled();
    expect(invalidate).toHaveBeenCalledTimes(1);
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: queryKeys.comments(7),
    });
  });

  it('unlikes the row the viewer holds', async () => {
    mockedLikes.deleteLike.mockResolvedValue(undefined);
    const { result } = setUp();

    await act(() => result.current.mutateAsync({ existingId: 5, payload }));

    expect(mockedLikes.deleteLike).toHaveBeenCalledWith(5);
    expect(mockedLikes.createLike).not.toHaveBeenCalled();
  });

  it.each([
    ['create', 409, null],
    ['delete', 404, 5],
  ])(
    'refreshes the key after a refused %s (%i) too',
    async (_op, status, existingId) => {
      const refusal = new ApiError(status, 'already changed');
      mockedLikes.createLike.mockRejectedValue(refusal);
      mockedLikes.deleteLike.mockRejectedValue(refusal);
      const { result, invalidate } = setUp();

      act(() => {
        result.current.mutate({ existingId, payload });
      });

      await waitFor(() =>
        expect(invalidate).toHaveBeenCalledWith({
          queryKey: queryKeys.comments(7),
        })
      );
    }
  );
});
