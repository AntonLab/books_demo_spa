import { renderHook, waitFor } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import {
  useCreateChapter,
  useDeleteChapter,
  useUpdateChapter,
} from './chapters';
import { createTestQueryClient } from '../test/queryClient';
import * as chaptersApi from '../api/chapters';
import type { PublicChapter } from '../types/chapter';

jest.mock('../api/chapters');

const mockedChapters = jest.mocked(chaptersApi);

const chapter: PublicChapter = {
  id: 9,
  bookId: 1,
  title: 'Chapter One',
  text: 'It was a dark night.',
  publishedAt: '2026-09-03T00:00:00.000Z',
  createdAt: '2026-09-01T00:00:00.000Z',
  updatedAt: '2026-09-03T00:00:00.000Z',
};

const setUp = () => {
  const client = createTestQueryClient();
  const invalidate = jest.spyOn(client, 'invalidateQueries');
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  Wrapper.displayName = 'QueryClientWrapper';

  return {
    wrapper: Wrapper,
    // The book detail carries wordCount, summed over Published chapters, so a
    // create, a save or a delete can each move it.
    expectListAndBookInvalidated: () => {
      expect(invalidate).toHaveBeenCalledWith({
        queryKey: ['chapters', { bookId: 1 }],
      });
      expect(invalidate).toHaveBeenCalledWith({ queryKey: ['books', 1] });
    },
  };
};

beforeEach(() => {
  jest.resetAllMocks();
  mockedChapters.createChapter.mockResolvedValue(chapter);
  mockedChapters.updateChapter.mockResolvedValue(chapter);
  mockedChapters.deleteChapter.mockResolvedValue(undefined);
});

describe('chapter writes', () => {
  it('publishing a new chapter refreshes the list and the book’s figures', async () => {
    const { wrapper, expectListAndBookInvalidated } = setUp();
    const { result } = renderHook(() => useCreateChapter(1), { wrapper });

    result.current.mutate({
      bookId: 1,
      title: 'Chapter One',
      text: 'It was a dark night.',
      publishedAt: 'now',
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expectListAndBookInvalidated();
  });

  it('saving a chapter refreshes the list and the book’s figures', async () => {
    const { wrapper, expectListAndBookInvalidated } = setUp();
    const { result } = renderHook(() => useUpdateChapter(1, 9), { wrapper });

    result.current.mutate({
      text: 'It was a dark and stormy night.',
      expectedUpdatedAt: '2026-09-03T00:00:00.000Z',
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockedChapters.updateChapter).toHaveBeenCalledWith(9, {
      text: 'It was a dark and stormy night.',
      expectedUpdatedAt: '2026-09-03T00:00:00.000Z',
    });
    expectListAndBookInvalidated();
  });

  it('deleting a chapter refreshes the list and the book’s figures', async () => {
    const { wrapper, expectListAndBookInvalidated } = setUp();
    const { result } = renderHook(() => useDeleteChapter(1, 9), { wrapper });

    result.current.mutate(undefined);

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockedChapters.deleteChapter).toHaveBeenCalledWith(9);
    expectListAndBookInvalidated();
  });
});
