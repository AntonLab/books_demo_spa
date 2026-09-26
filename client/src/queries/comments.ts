import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createComment,
  deleteComment,
  listComments,
  updateComment,
  type CreateCommentPayload,
} from '../api/comments';
import { queryKeys } from './keys';

export const useComments = (bookId: number) => {
  return useQuery({
    queryKey: queryKeys.comments(bookId),
    queryFn: () => listComments(bookId),
  });
};

// All three mutations invalidate the thread and the book's detail, whose
// commentCount BookPage's Statistics tab shows. An edit moves no count, but one
// extra detail refetch is cheaper than a second mutation shape. A comment
// change cannot affect the chapters or another book's thread. Only the
// thread's refetch is awaited: CommentSection clears its form when the write
// settles, and the detail refetch would hold that back a round trip.
const useCommentMutation = <TVariables>(
  bookId: number,
  mutationFn: (variables: TVariables) => Promise<unknown>
) => {
  const queryClient = useQueryClient();

  return useMutation({
    // Wrapped rather than passed straight through: TanStack calls a mutationFn
    // with a second context argument, and forwarding that into an API function
    // would hand it a stray parameter it never asked for.
    mutationFn: (variables: TVariables) => mutationFn(variables),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.book(bookId) });
      return queryClient.invalidateQueries({
        queryKey: queryKeys.comments(bookId),
      });
    },
  });
};

export const useCreateComment = (bookId: number) => {
  return useCommentMutation<CreateCommentPayload>(bookId, createComment);
};

export const useUpdateComment = (bookId: number) => {
  return useCommentMutation<{ id: number; text: string }>(
    bookId,
    ({ id, text }) => updateComment(id, text)
  );
};

export const useDeleteComment = (bookId: number) => {
  return useCommentMutation<number>(bookId, deleteComment);
};
