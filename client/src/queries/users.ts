import { useMutation, useQueryClient } from '@tanstack/react-query';
import { deleteAvatar, uploadAvatar } from '../api/users';
import { queryKeys } from './keys';

// An Avatar change touches every place an AuthorSummary or a PublicUser is
// embedded (K3): the session itself, and every books/series/comments list
// or detail that names its owner, plus the author-picker's search cache.
const useAvatarMutation = <TVariables, TResult>(
  mutationFn: (variables: TVariables) => Promise<TResult>
) => {
  const queryClient = useQueryClient();

  return useMutation({
    // Wrapped rather than passed straight through, as every mutationFn here
    // is: TanStack calls it with a second context argument an api/ function
    // never declared.
    mutationFn: (variables: TVariables) => mutationFn(variables),
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.session }),
        queryClient.invalidateQueries({ queryKey: ['books'] }),
        queryClient.invalidateQueries({ queryKey: ['series'] }),
        queryClient.invalidateQueries({ queryKey: ['comments'] }),
        queryClient.invalidateQueries({ queryKey: ['authors'] }),
      ]),
  });
};

export const useUploadAvatar = (userId: number) =>
  useAvatarMutation((file: File) => uploadAvatar(userId, file));

export const useDeleteAvatar = (userId: number) =>
  useAvatarMutation(() => deleteAvatar(userId));
