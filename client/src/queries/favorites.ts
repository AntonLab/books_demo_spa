import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { QueryKey } from '@tanstack/react-query';
import {
  createFavorite,
  deleteFavorite,
  listFavoriteBooks,
  listFavoriteSeries,
} from '../api/favorites';
import type { CreateFavoritePayload } from 'shared';
import { queryKeys } from './keys';

const pageParams = (page: number, pageSize: number) => ({
  limit: pageSize,
  offset: (page - 1) * pageSize,
});

// One hook for both directions, as useToggleLike: `existingId` is the
// viewerFavoriteId the caller holds (null adds, a number removes that row),
// and `invalidates` is the work's own detail key.
export const useToggleFavorite = (invalidates: QueryKey) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (variables: {
      existingId: number | null;
      payload: CreateFavoritePayload;
    }): Promise<void> => {
      if (variables.existingId === null) {
        await createFavorite(variables.payload);
        return;
      }
      await deleteFavorite(variables.existingId);
    },
    // onSettled, not onSuccess: a 409 (added from another tab) or a 404
    // (already removed) means the star and the count on screen are stale,
    // and only the refetch puts them right.
    onSettled: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: invalidates }),
        queryClient.invalidateQueries({ queryKey: queryKeys.allFavorites }),
      ]),
  });
};

// `page` is 1-based, as antd's Pagination counts.
export const useFavoriteBooks = (page: number, pageSize: number) => {
  return useQuery({
    queryKey: queryKeys.favoriteBooks(page, pageSize),
    queryFn: () => listFavoriteBooks(pageParams(page, pageSize)),
  });
};

export const useFavoriteSeries = (page: number, pageSize: number) => {
  return useQuery({
    queryKey: queryKeys.favoriteSeries(page, pageSize),
    queryFn: () => listFavoriteSeries(pageParams(page, pageSize)),
  });
};

// The Favorites page's remove. Every book and series detail carries the
// count and the viewer's Favorite id, so both prefixes go stale with the
// lists. onSettled for the reason useToggleFavorite gives.
export const useRemoveFavorite = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: number) => deleteFavorite(id),
    onSettled: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.allFavorites }),
        queryClient.invalidateQueries({ queryKey: ['books'] }),
        queryClient.invalidateQueries({ queryKey: ['series'] }),
      ]),
  });
};
