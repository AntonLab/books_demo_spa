import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createSeries,
  deleteSeries,
  getSeries,
  listSeries,
  listSeriesBooks,
  removeBookFromSeries,
  reorderSeriesBooks,
  updateSeries,
  type SeriesPayload,
} from '../api/series';
import type { SeriesBookSummary } from '../types/api';
import { queryKeys } from './keys';
import { useOptimisticReorder } from './reorder';

// The series a Co-author can file a book under, and the Series tab of My
// books. One page at the server's cap: an author's own series are few.
export const useMySeries = (userId: number | undefined) => {
  return useQuery({
    queryKey: queryKeys.series({ userId, limit: 100 }),
    queryFn: () => listSeries({ userId, limit: 100 }),
    enabled: userId !== undefined,
  });
};

export const useSeries = (id: number) => {
  return useQuery({
    queryKey: queryKeys.seriesDetail(id),
    queryFn: () => getSeries(id),
  });
};

// Disabled until the page knows the viewer may edit the series: anyone else
// would only be refused.
export const useSeriesBooks = (id: number, enabled: boolean) => {
  return useQuery({
    queryKey: queryKeys.seriesBooks(id),
    queryFn: () => listSeriesBooks(id),
    enabled,
  });
};

// Every series write invalidates the `series` prefix and the `books` one: a
// deleted series unlinks its books, and a book taken out of one changes what
// that book's page shows.
const useSeriesMutation = <TVariables, TResult>(
  mutationFn: (variables: TVariables) => Promise<TResult>
) => {
  const queryClient = useQueryClient();

  return useMutation({
    // Wrapped rather than passed straight through: TanStack calls a mutationFn
    // with a second context argument an API function never declared.
    mutationFn: (variables: TVariables) => mutationFn(variables),
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: ['series'] }),
        queryClient.invalidateQueries({ queryKey: ['books'] }),
      ]),
  });
};

export const useCreateSeries = () =>
  useSeriesMutation((payload: SeriesPayload) => createSeries(payload));

export const useUpdateSeries = (id: number) =>
  useSeriesMutation((payload: Partial<SeriesPayload>) =>
    updateSeries(id, payload)
  );

export const useDeleteSeries = (id: number) =>
  useSeriesMutation(() => deleteSeries(id));

export const useRemoveBookFromSeries = (seriesId: number) =>
  useSeriesMutation((bookId: number) => removeBookFromSeries(seriesId, bookId));

// Saves the Series order on drop; see useOptimisticReorder.
export const useReorderSeriesBooks = (seriesId: number) =>
  useOptimisticReorder<{ items: SeriesBookSummary[] }>(
    queryKeys.seriesBooks(seriesId),
    queryKeys.seriesBooks(seriesId),
    (bookIds) => reorderSeriesBooks(seriesId, bookIds)
  );
