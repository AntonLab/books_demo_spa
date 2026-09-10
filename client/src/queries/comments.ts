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

// All three mutations invalidate the same key and nothing else: a comment
// change cannot affect the book, the chapters, or another book's thread.
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
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: queryKeys.comments(bookId) }),
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
