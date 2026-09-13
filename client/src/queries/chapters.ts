import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createChapter,
  deleteChapter,
  getChapter,
  listChapters,
  reorderChapters,
  updateChapter,
  type CreateChapterPayload,
  type UpdateChapterPayload,
} from '../api/chapters';
import { queryKeys } from './keys';
import type { ListResponse } from '../types/api';
import type { ChapterSummary } from '../types/chapter';

// ChapterPage reads this same key, so arriving from BookPage costs no request:
// only the chapter body is fetched there.
export const useChapters = (bookId: number) => {
  return useQuery({
    queryKey: queryKeys.chapters(bookId),
    queryFn: () => listChapters(bookId),
  });
};

export const useChapter = (id: number) => {
  return useQuery({
    queryKey: queryKeys.chapter(id),
    queryFn: () => getChapter(id),
  });
};

// Every chapter write invalidates the book's chapter list and every chapter
// detail: a save can change what a list shows (a draft published) as well as
// the record itself.
const useChapterMutation = <TVariables, TResult>(
  bookId: number,
  mutationFn: (variables: TVariables) => Promise<TResult>
) => {
  const queryClient = useQueryClient();

  return useMutation({
    // Wrapped rather than passed straight through: TanStack calls a mutationFn
    // with a second context argument an API function never declared.
    mutationFn: (variables: TVariables) => mutationFn(variables),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.chapters(bookId),
      });
      void queryClient.invalidateQueries({ queryKey: ['chapters'] });
    },
  });
};

export const useCreateChapter = (bookId: number) =>
  useChapterMutation(bookId, (payload: CreateChapterPayload) =>
    createChapter(payload)
  );

export const useUpdateChapter = (bookId: number, id: number) =>
  useChapterMutation(bookId, (payload: UpdateChapterPayload) =>
    updateChapter(id, payload)
  );

export const useDeleteChapter = (bookId: number, id: number) =>
  useChapterMutation(bookId, () => deleteChapter(id));

// Saves on drop, optimistically: the book's list is rewritten in the new order
// before the request leaves, put back if it fails, and refetched either way —
// which, after a 409, is what brings in the chapter someone else added or
// deleted.
export const useReorderChapters = (bookId: number) => {
  const queryClient = useQueryClient();
  const key = queryKeys.chapters(bookId);

  return useMutation({
    mutationFn: (chapterIds: number[]) => reorderChapters(bookId, chapterIds),
    onMutate: async (chapterIds: number[]) => {
      // A refetch landing mid-drop would overwrite the optimistic order with
      // the old one.
      await queryClient.cancelQueries({ queryKey: key });
      const previous =
        queryClient.getQueryData<ListResponse<ChapterSummary>>(key);

      if (previous) {
        const byId = new Map(
          previous.items.map((chapter) => [chapter.id, chapter])
        );
        queryClient.setQueryData<ListResponse<ChapterSummary>>(key, {
          ...previous,
          items: chapterIds.flatMap((id) => {
            const chapter = byId.get(id);
            return chapter ? [chapter] : [];
          }),
        });
      }
      return { previous };
    },
    onError: (_error, _chapterIds, context) => {
      if (context?.previous) queryClient.setQueryData(key, context.previous);
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ['chapters'] });
    },
  });
};
