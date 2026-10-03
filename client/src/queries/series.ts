import {
  hashKey,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import {
  createSeries,
  deleteSeries,
  deleteSeriesCover,
  getSeries,
  listFavoritedSeries,
  listSeries,
  listSeriesBooks,
  removeBookFromSeries,
  reorderSeriesBooks,
  updateSeries,
  uploadSeriesCover,
  type ListSeriesParams,
} from '../api/series';
import type { SeriesPayload } from 'shared';
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

export const useSeriesList = (params: ListSeriesParams, enabled: boolean) => {
  return useQuery({
    queryKey: queryKeys.series(params),
    queryFn: () => listSeries(params),
    enabled,
  });
};

// The key carries `favoritedBy` so a favorited list never shares a cache entry
// with the same search over all works.
export const useFavoritedSeries = (
  params: ListSeriesParams,
  enabled: boolean
) => {
  return useQuery({
    queryKey: queryKeys.series({ ...params, favoritedBy: 'me' }),
    queryFn: () => listFavoritedSeries(params),
    enabled,
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
// `refreshOnError` is for a delete: one that fails because the series is
// already gone (404) or no longer editable (403) leaves the lists stale,
// whereas a failed update must not refetch the form's own data under the
// user's edits.
const useSeriesMutation = <TVariables, TResult>(
  mutationFn: (variables: TVariables) => Promise<TResult>,
  {
    refreshOnError = false,
    deletedId,
  }: { refreshOnError?: boolean; deletedId?: number } = {}
) => {
  const queryClient = useQueryClient();
  const refresh = (skipDetail?: boolean) =>
    Promise.all([
      queryClient.invalidateQueries({
        queryKey: ['series'],
        // A delete skips the deleted series' own detail: its page is still
        // mounted, would refetch into a 404 and redirect with "no longer
        // exists" before the delete's own landing page takes over.
        ...(skipDetail &&
          deletedId !== undefined && {
            predicate: (query) =>
              hashKey(query.queryKey) !==
              hashKey(queryKeys.seriesDetail(deletedId)),
          }),
      }),
      queryClient.invalidateQueries({ queryKey: ['books'] }),
    ]);

  return useMutation({
    // Wrapped rather than passed straight through: TanStack calls a mutationFn
    // with a second context argument an API function never declared.
    mutationFn: (variables: TVariables) => mutationFn(variables),
    onSuccess: () => refresh(true),
    ...(refreshOnError && { onError: () => refresh() }),
  });
};

export const useCreateSeries = () =>
  useSeriesMutation((payload: SeriesPayload) => createSeries(payload));

export const useUpdateSeries = (id: number) =>
  useSeriesMutation((payload: Partial<SeriesPayload>) =>
    updateSeries(id, payload)
  );

export const useDeleteSeries = (id: number) =>
  useSeriesMutation(() => deleteSeries(id), {
    refreshOnError: true,
    deletedId: id,
  });

// A Cover change invalidates every prefix a card of the Series may sit in.
export const useUploadSeriesCover = (id: number) =>
  useSeriesMutation((file: File) => uploadSeriesCover(id, file));

export const useDeleteSeriesCover = (id: number) =>
  useSeriesMutation(() => deleteSeriesCover(id));

export const useRemoveBookFromSeries = (seriesId: number) =>
  useSeriesMutation((bookId: number) => removeBookFromSeries(seriesId, bookId));

// Saves the Series order on drop; see useOptimisticReorder.
export const useReorderSeriesBooks = (seriesId: number) =>
  useOptimisticReorder<{ items: SeriesBookSummary[] }>(
    queryKeys.seriesBooks(seriesId),
    queryKeys.seriesBooks(seriesId),
    (bookIds) => reorderSeriesBooks(seriesId, bookIds)
  );
