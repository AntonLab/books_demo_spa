import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { QueryKey } from '@tanstack/react-query';

// Saves a new order on drop, optimistically, for any cached list whose rows
// carry an id — a book's chapters, a series' books. The list under `listKey` is
// rewritten in the new order before the request leaves, put back if it fails,
// and every key under `invalidate` is refetched either way — which, after a
// 409, is what brings in the row someone else added or removed.
export const useOptimisticReorder = <TList extends { items: { id: number }[] }>(
  listKey: QueryKey,
  invalidate: QueryKey,
  save: (ids: number[]) => Promise<void>
) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (ids: number[]) => save(ids),
    onMutate: async (ids: number[]) => {
      // A refetch landing mid-drop would overwrite the optimistic order with
      // the old one.
      await queryClient.cancelQueries({ queryKey: listKey });
      const previous = queryClient.getQueryData<TList>(listKey);

      if (previous) {
        const byId = new Map(previous.items.map((row) => [row.id, row]));
        queryClient.setQueryData<TList>(listKey, {
          ...previous,
          items: ids.flatMap((id) => {
            const row = byId.get(id);
            return row ? [row] : [];
          }),
        });
      }
      return { previous };
    },
    onError: (_error, _ids, context) => {
      if (context?.previous) {
        queryClient.setQueryData(listKey, context.previous);
      }
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: invalidate });
    },
  });
};
