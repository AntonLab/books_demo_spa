import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ReadingProgressPayload } from 'shared';
import {
  addBookToLibrary,
  addSeriesToLibrary,
  clearReadingStatus,
  listLibrary,
  postReadingProgress,
  removeSeriesFromLibrary,
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

// The Book page's Library buttons. Responses are ignored: the Book detail
// refetch carries the status. onSettled, as in useToggleFavorite: a 404 means
// the Book is gone and only the refetch fixes the screen. isPending covers all
// three, so one request is in flight.
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

// The Chapter page's reading events. Failures are not shown: reading must not
// be interrupted, and the next open or finish reports again. The answer is a
// 204, so the change cannot be read from it. `opened` can lift a not_interested
// Book into Reading and the ranked lists use hideNotInterested; `finished`
// moves it on. Either way the book lists, the Series (viewerLibrary derives
// from Book statuses) and the Library are refetched.
export const useReadingProgressMutation = () => {
  const queryClient = useQueryClient();

  return useMutation({
    // Wrapped: useMutation hands mutationFn a second argument.
    mutationFn: (variables: {
      bookId: number;
      payload: ReadingProgressPayload;
    }) => postReadingProgress(variables.bookId, variables.payload),
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.allBooks }),
        queryClient.invalidateQueries({ queryKey: queryKeys.allSeries }),
        queryClient.invalidateQueries({ queryKey: queryKeys.allLibrary }),
      ]),
  });
};
