import { renderHook, waitFor } from '@testing-library/react';
import { QueryClientProvider, useQuery } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import {
  useCreateComment,
  useDeleteComment,
  useUpdateComment,
} from './comments';
import { createTestQueryClient } from '../test/queryClient';
import * as commentsApi from '../api/comments';
import type { PublicComment } from '../types/api';

jest.mock('../api/comments');

const mockedComments = jest.mocked(commentsApi);

const comment: PublicComment = {
  id: 5,
  parentId: null,
  userId: 9,
  bookId: 1,
  text: 'Loved it',
  tombstone: null,
  createdAt: '2026-09-01T00:00:00.000Z',
  updatedAt: '2026-09-01T00:00:00.000Z',
};

// A client of its own per test, with a spy on it: the assertion is which
// keys a write invalidates, not what a refetch would bring back.
const setUp = () => {
  const client = createTestQueryClient();
  const invalidate = jest.spyOn(client, 'invalidateQueries');
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  Wrapper.displayName = 'QueryClientWrapper';

  return {
    wrapper: Wrapper,
    // The book detail carries commentCount, which BookPage's Statistics tab
    // shows; the thread is what CommentSection shows.
    expectThreadAndBookInvalidated: () => {
      expect(invalidate).toHaveBeenCalledWith({
        queryKey: ['comments', { bookId: 1 }],
      });
      expect(invalidate).toHaveBeenCalledWith({ queryKey: ['books', 1] });
    },
  };
};

beforeEach(() => {
  jest.resetAllMocks();
  mockedComments.createComment.mockResolvedValue(comment);
  mockedComments.updateComment.mockResolvedValue(comment);
  mockedComments.deleteComment.mockResolvedValue(undefined);
});

describe('comment writes', () => {
  it('posting a comment refreshes the thread and the book’s figures', async () => {
    const { wrapper, expectThreadAndBookInvalidated } = setUp();
    const { result } = renderHook(() => useCreateComment(1), { wrapper });

    result.current.mutate({ bookId: 1, parentId: null, text: 'Loved it' });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockedComments.createComment).toHaveBeenCalledWith({
      bookId: 1,
      parentId: null,
      text: 'Loved it',
    });
    expectThreadAndBookInvalidated();
  });

  it('deleting a comment refreshes the thread and the book’s figures', async () => {
    const { wrapper, expectThreadAndBookInvalidated } = setUp();
    const { result } = renderHook(() => useDeleteComment(1), { wrapper });

    result.current.mutate(5);

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockedComments.deleteComment).toHaveBeenCalledWith(5);
    expectThreadAndBookInvalidated();
  });

  it('editing a comment refreshes the thread and the book, through the same path', async () => {
    const { wrapper, expectThreadAndBookInvalidated } = setUp();
    const { result } = renderHook(() => useUpdateComment(1), { wrapper });

    result.current.mutate({ id: 5, text: 'Loved it, truly' });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockedComments.updateComment).toHaveBeenCalledWith(
      5,
      'Loved it, truly'
    );
    expectThreadAndBookInvalidated();
  });

  // CommentSection clears its form once the write settles, so a slow book
  // refetch must not hold it back; only the thread's refetch is awaited.
  it('settles without waiting for the book’s figures to come back', async () => {
    const { wrapper } = setUp();
    const { result } = renderHook(
      () => {
        useQuery({
          queryKey: ['books', 1],
          queryFn: () => new Promise<never>(() => {}),
        });
        return useCreateComment(1);
      },
      { wrapper }
    );

    result.current.mutate({ bookId: 1, parentId: null, text: 'Loved it' });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
  });
});
