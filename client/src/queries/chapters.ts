import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createChapter,
  deleteChapter,
  getChapter,
  listChapters,
  updateChapter,
  type CreateChapterPayload,
  type UpdateChapterPayload,
} from '../api/chapters';
import { queryKeys } from './keys';

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
