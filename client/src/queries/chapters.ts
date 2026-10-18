import {
  hashKey,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import {
  createChapter,
  deleteChapter,
  getChapter,
  listChapters,
  reorderChapters,
  updateChapter,
} from '../api/chapters';
import { queryKeys } from './keys';
import { useOptimisticReorder } from './reorder';
import type {
  CreateChapterPayload,
  ListResponse,
  UpdateChapterPayload,
} from 'shared';
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

// Every chapter write invalidates all chapter queries (the book's list and every
// detail) and the book's detail. A save can change what a list shows (a draft
// published) and the record itself. The detail's wordCount sums the Published
// chapters' text. A delete skips the deleted chapter's own detail: its page or
// modal is still mounted and would refetch into a 404. (removeQueries would not
// help: a mounted observer rebuilds the removed query and fetches it again.)
const useChapterMutation = <TVariables, TResult>(
  bookId: number,
  mutationFn: (variables: TVariables) => Promise<TResult>,
  deletedId?: number
) => {
  const queryClient = useQueryClient();

  return useMutation({
    // Wrapped rather than passed straight through: TanStack calls a mutationFn
    // with a second context argument an API function never declared.
    mutationFn: (variables: TVariables) => mutationFn(variables),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.allChapters,
        ...(deletedId !== undefined && {
          predicate: (query) =>
            hashKey(query.queryKey) !== hashKey(queryKeys.chapter(deletedId)),
        }),
      });
      void queryClient.invalidateQueries({ queryKey: queryKeys.book(bookId) });
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
  useChapterMutation(bookId, () => deleteChapter(id), id);

// Saves the book's Reading order on drop; see useOptimisticReorder.
export const useReorderChapters = (bookId: number) =>
  useOptimisticReorder<ListResponse<ChapterSummary>>(
    queryKeys.chapters(bookId),
    [],
    (chapterIds) => reorderChapters(bookId, chapterIds)
  );
