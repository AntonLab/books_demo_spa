import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createGenre,
  deleteGenre,
  listGenres,
  renameGenre,
  type GenrePayload,
} from '../api/genres';
import { queryKeys } from './keys';

// The whole list, unpaged: the header's submenu, both forms' select and the
// management page all read this one entry.
export const useGenres = () => {
  return useQuery({
    queryKey: queryKeys.genres,
    queryFn: () => listGenres(),
  });
};

// Every genre write invalidates three prefixes. `genres` is obvious; `books`
// and `series` go because a rename or a deletion changes the `genre` embedded
// in every book and series a cached list already holds.
const useGenreMutation = <TVariables, TResult>(
  mutationFn: (variables: TVariables) => Promise<TResult>
) => {
  const queryClient = useQueryClient();

  return useMutation({
    // Wrapped rather than passed straight through: TanStack calls a mutationFn
    // with a second context argument an API function never declared.
    mutationFn: (variables: TVariables) => mutationFn(variables),
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: ['genres'] }),
        queryClient.invalidateQueries({ queryKey: ['books'] }),
        queryClient.invalidateQueries({ queryKey: ['series'] }),
      ]),
  });
};

export const useCreateGenre = () =>
  useGenreMutation((payload: GenrePayload) => createGenre(payload));

export const useRenameGenre = (id: number) =>
  useGenreMutation((payload: GenrePayload) => renameGenre(id, payload));

// Explicitly `<void, void>` so the caller writes `mutate()` rather than
// `mutate(undefined)`: there is nothing to send.
export const useDeleteGenre = (id: number) =>
  useGenreMutation<void, void>(() => deleteGenre(id));
