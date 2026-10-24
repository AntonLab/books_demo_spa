import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ReadingStatus } from 'shared';
import {
  addBookToLibrary,
  addSeriesToLibrary,
  clearReadingStatus,
  listLibrary,
  removeSeriesFromLibrary,
  setReadingStatus,
  toggleBookNotInterested,
  toggleSeriesNotInterested,
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

// The Book page's Library buttons. The responses are ignored: the refetch of
// the Book detail carries the viewer's status. onSettled for the reason
// useSetReadingStatus gives. isPending covers all three, so one request is
// in flight at a time.
export const useBookLibraryActions = () => {
  const queryClient = useQueryClient();
  const onSettled = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.allBooks }),
      queryClient.invalidateQueries({ queryKey: queryKeys.allLibrary }),
    ]);

  // Wrapped: useMutation hands mutationFn a second argument.
  const add = useMutation({
    mutationFn: (bookId: number) => addBookToLibrary(bookId),
    onSettled,
  });
  const toggleNotInterested = useMutation({
    mutationFn: (bookId: number) => toggleBookNotInterested(bookId),
    onSettled,
  });
  const remove = useMutation({
    mutationFn: (bookId: number) => clearReadingStatus(bookId),
    onSettled,
  });

  return {
    add,
    toggleNotInterested,
    remove,
    isPending:
      add.isPending || toggleNotInterested.isPending || remove.isPending,
  };
};

// The Series page's Library buttons; same shape as useBookLibraryActions. The
// Series detail carries viewerLibrary, so it is refetched with the Books.
export const useSeriesLibraryActions = (seriesId: number) => {
  const queryClient = useQueryClient();
  const onSettled = () =>
    Promise.all([
      queryClient.invalidateQueries({
        queryKey: queryKeys.seriesDetail(seriesId),
      }),
      queryClient.invalidateQueries({ queryKey: queryKeys.allBooks }),
      queryClient.invalidateQueries({ queryKey: queryKeys.allLibrary }),
    ]);

  const add = useMutation({
    mutationFn: () => addSeriesToLibrary(seriesId),
    onSettled,
  });
  const toggleNotInterested = useMutation({
    mutationFn: () => toggleSeriesNotInterested(seriesId),
    onSettled,
  });
  const remove = useMutation({
    mutationFn: () => removeSeriesFromLibrary(seriesId),
    onSettled,
  });

  return {
    add,
    toggleNotInterested,
    remove,
    isPending:
      add.isPending || toggleNotInterested.isPending || remove.isPending,
  };
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
        queryClient.invalidateQueries({ queryKey: queryKeys.allBooks }),
        queryClient.invalidateQueries({ queryKey: queryKeys.allLibrary }),
      ]),
  });
};
