import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ReadingStatus } from 'shared';
import {
  clearReadingStatus,
  listLibrary,
  setReadingStatus,
  type ListLibraryParams,
} from '../api/library';
import { queryKeys } from './keys';

export const useLibrary = (params: ListLibraryParams, enabled = true) => {
  return useQuery({
    queryKey: queryKeys.library(params),
    queryFn: () => listLibrary(params),
    enabled,
  });
};

// One hook for set and clear: a null status removes the Book from the
// Library. onSettled, not onSuccess, for the reason useToggleFavorite gives:
// a 404 means the screen shows a Book that is gone, and only the refetch
// puts it right. Every book detail carries the viewer's status and the counts.
export const useSetReadingStatus = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (variables: {
      bookId: number;
      status: ReadingStatus | null;
    }): Promise<void> => {
      if (variables.status === null) {
        await clearReadingStatus(variables.bookId);
        return;
      }
      await setReadingStatus(variables.bookId, variables.status);
    },
    onSettled: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: ['books'] }),
        queryClient.invalidateQueries({ queryKey: queryKeys.allLibrary }),
      ]),
  });
};
