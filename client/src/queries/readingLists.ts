import {
  hashKey,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import {
  addReadingListItem,
  copyReadingList,
  createReadingList,
  deleteReadingList,
  getReadingList,
  listMyReadingLists,
  listReadingListItems,
  listReadingLists,
  removeReadingListItem,
  reorderReadingListItems,
  updateReadingList,
  type ListReadingListsParams,
  type WorkTarget,
} from '../api/readingLists';
import type { ReadingListPayload } from 'shared';
import type { ReadingListEditItem } from '../types/readingList';
import { queryKeys } from './keys';
import { useOptimisticReorder } from './reorder';

export const useReadingList = (id: number) => {
  return useQuery({
    queryKey: queryKeys.readingList(id),
    queryFn: () => getReadingList(id),
  });
};

export const useReadingListsByAccount = (
  params: ListReadingListsParams,
  enabled: boolean
) => {
  return useQuery({
    queryKey: queryKeys.readingListsPage(params),
    queryFn: () => listReadingLists(params),
    enabled,
  });
};

// Needs no invalidation of its own: useReadingListMutation already refreshes
// the allReadingLists prefix on add and remove.
export const useReadingListsByBook = (
  bookId: number,
  current: number,
  pageSize: number
) => {
  return useQuery({
    queryKey: queryKeys.readingListsPage({ bookId, current, pageSize }),
    queryFn: () => listReadingLists({ bookId, current, pageSize }),
  });
};

// Owner only: disabled until the page knows the viewer owns the list.
export const useReadingListItems = (id: number, enabled: boolean) => {
  return useQuery({
    queryKey: queryKeys.readingListItems(id),
    queryFn: () => listReadingListItems(id),
    enabled,
  });
};

// The Add to reading list state: disabled while its popover is closed or the
// viewer is a Guest.
export const useMyReadingLists = (target: WorkTarget, enabled: boolean) => {
  return useQuery({
    queryKey: queryKeys.myListsForWork(target),
    queryFn: () => listMyReadingLists(target),
    enabled,
  });
};

// Every write refreshes the lists' prefix (page, Profile tab) and the
// caller's own lists (the Add to reading list state).
// `refreshOnError` is for a delete, as in useSeriesMutation. `settle` is for
// add and remove: a 409 or 404 means the checkboxes on screen are stale, and
// only the refetch puts them right.
const useReadingListMutation = <TVariables, TResult>(
  mutationFn: (variables: TVariables) => Promise<TResult>,
  {
    refreshOnError = false,
    settle = false,
    deletedId,
  }: { refreshOnError?: boolean; settle?: boolean; deletedId?: number } = {}
) => {
  const queryClient = useQueryClient();
  const refresh = (skipDetail?: boolean) =>
    Promise.all([
      queryClient.invalidateQueries({
        queryKey: queryKeys.allReadingLists,
        // A delete skips the deleted list's own detail: its page is still
        // mounted and would refetch into a 404 before the delete's landing
        // page takes over.
        ...(skipDetail &&
          deletedId !== undefined && {
            predicate: (query) =>
              hashKey(query.queryKey) !==
              hashKey(queryKeys.readingList(deletedId)),
          }),
      }),
      queryClient.invalidateQueries({ queryKey: queryKeys.allMyReadingLists }),
    ]);

  return useMutation({
    mutationFn: (variables: TVariables) => mutationFn(variables),
    ...(settle
      ? { onSettled: () => refresh() }
      : {
          onSuccess: () => refresh(true),
          ...(refreshOnError && { onError: () => refresh() }),
        }),
  });
};

export const useCreateReadingList = () =>
  useReadingListMutation((payload: ReadingListPayload) =>
    createReadingList(payload)
  );

export const useUpdateReadingList = (id: number) =>
  useReadingListMutation((payload: Partial<ReadingListPayload>) =>
    updateReadingList(id, payload)
  );

export const useDeleteReadingList = (id: number) =>
  useReadingListMutation(() => deleteReadingList(id), {
    refreshOnError: true,
    deletedId: id,
  });

export const useRemoveReadingListItem = (id: number) =>
  useReadingListMutation(
    (itemId: number) => removeReadingListItem(id, itemId),
    {
      settle: true,
    }
  );

// One hook for both directions, as useToggleFavorite: `itemId` null adds
// `target` to the list, a number removes that item.
export const useToggleListItem = (target: WorkTarget) =>
  useReadingListMutation(
    async ({
      listId,
      itemId,
    }: {
      listId: number;
      itemId: number | null;
    }): Promise<void> => {
      if (itemId === null) await addReadingListItem(listId, target);
      else await removeReadingListItem(listId, itemId);
    },
    { settle: true }
  );

// Saves the order on drop; the list page and the Profile tab refresh too.
export const useReorderReadingListItems = (id: number) =>
  useOptimisticReorder<{ items: ReadingListEditItem[] }>(
    queryKeys.readingListItems(id),
    queryKeys.allReadingLists,
    (itemIds) => reorderReadingListItems(id, itemIds)
  );

export const useCopyReadingList = () =>
  useReadingListMutation((id: number) => copyReadingList(id));
