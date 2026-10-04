import { act, waitFor } from '@testing-library/react';
import {
  useCopyReadingList,
  useCreateReadingList,
  useDeleteReadingList,
  useMyReadingLists,
  useReadingListItems,
  useReadingListsByBook,
  useRemoveReadingListItem,
  useReorderReadingListItems,
  useToggleListItem,
  useUpdateReadingList,
} from './readingLists';
import { queryKeys } from './keys';
import { renderHookWithProviders } from '../test/renderWithProviders';
import { ApiError } from '../api/client';
import * as readingListsApi from '../api/readingLists';
import type { ReadingListItem } from '../types/readingList';

jest.mock('../api/readingLists');
const mocked = jest.mocked(readingListsApi);

const item = {
  id: 9,
  position: 0,
  bookId: 7,
  seriesId: null,
} as unknown as ReadingListItem;

beforeEach(() => {
  jest.resetAllMocks();
  mocked.addReadingListItem.mockResolvedValue(item);
  mocked.removeReadingListItem.mockResolvedValue(undefined);
  mocked.createReadingList.mockResolvedValue({} as never);
  mocked.updateReadingList.mockResolvedValue({} as never);
  mocked.deleteReadingList.mockResolvedValue(undefined);
  mocked.copyReadingList.mockResolvedValue({} as never);
  mocked.reorderReadingListItems.mockResolvedValue(undefined);
  mocked.listMyReadingLists.mockResolvedValue({ items: [] });
  mocked.listReadingListItems.mockResolvedValue({ items: [] });
});

it('useToggleListItem adds to the list with itemId null, removes with a number, and refreshes both prefixes', async () => {
  const { result, queryClient } = renderHookWithProviders(() =>
    useToggleListItem({ bookId: 7 })
  );
  const invalidate = jest.spyOn(queryClient, 'invalidateQueries');
  await act(() => result.current.mutateAsync({ listId: 4, itemId: null }));
  expect(mocked.addReadingListItem).toHaveBeenCalledWith(4, { bookId: 7 });
  await act(() => result.current.mutateAsync({ listId: 4, itemId: 9 }));
  expect(mocked.removeReadingListItem).toHaveBeenCalledWith(4, 9);
  expect(invalidate).toHaveBeenCalledWith({
    queryKey: queryKeys.allReadingLists,
  });
  expect(invalidate).toHaveBeenCalledWith({
    queryKey: queryKeys.allMyReadingLists,
  });
});

it('useToggleListItem refreshes even when the add is refused with a 409', async () => {
  mocked.addReadingListItem.mockRejectedValue(new ApiError(409, 'Conflict'));
  const { result, queryClient } = renderHookWithProviders(() =>
    useToggleListItem({ bookId: 7 })
  );
  const invalidate = jest.spyOn(queryClient, 'invalidateQueries');
  await act(() =>
    result.current
      .mutateAsync({ listId: 4, itemId: null })
      .catch(() => undefined)
  );
  expect(invalidate).toHaveBeenCalledWith({
    queryKey: queryKeys.allReadingLists,
  });
  expect(invalidate).toHaveBeenCalledWith({
    queryKey: queryKeys.allMyReadingLists,
  });
});

it.each([
  [
    'create',
    () => useCreateReadingList(),
    { title: 'T', description: '', tags: [] },
  ],
  ['update', () => useUpdateReadingList(4), { title: 'U' }],
  ['remove', () => useRemoveReadingListItem(4), 9],
  ['copy', () => useCopyReadingList(), 4],
])('%s refreshes both prefixes', async (_name, useHook, variables) => {
  const { result, queryClient } = renderHookWithProviders(
    () => useHook() as never
  );
  const invalidate = jest.spyOn(queryClient, 'invalidateQueries');
  await act(() =>
    (
      result.current as { mutateAsync: (v: unknown) => Promise<unknown> }
    ).mutateAsync(variables)
  );
  const keys = invalidate.mock.calls.map(([filters]) => filters?.queryKey);
  expect(keys).toContainEqual(queryKeys.allReadingLists);
  expect(keys).toContainEqual(queryKeys.allMyReadingLists);
});

it('useDeleteReadingList spares its own detail on success and refreshes it after a failure', async () => {
  const first = renderHookWithProviders(() => useDeleteReadingList(4));
  const spy = jest.spyOn(first.queryClient, 'invalidateQueries');
  await act(() => first.result.current.mutateAsync());
  const lists = spy.mock.calls.find(
    ([f]) => f?.queryKey === queryKeys.allReadingLists
  )?.[0];
  const matches = (key: readonly unknown[]) =>
    lists?.predicate?.({ queryKey: key } as never);
  expect(matches(queryKeys.readingList(4))).toBe(false);
  expect(matches(queryKeys.readingListsPage({ userId: 1 }))).toBe(true);
  expect(spy).toHaveBeenCalledWith({ queryKey: queryKeys.allMyReadingLists });

  mocked.deleteReadingList.mockRejectedValue(new ApiError(404, 'Not Found'));
  const second = renderHookWithProviders(() => useDeleteReadingList(4));
  const failed = jest.spyOn(second.queryClient, 'invalidateQueries');
  await act(() => second.result.current.mutateAsync().catch(() => undefined));
  expect(failed).toHaveBeenCalledWith({ queryKey: queryKeys.allReadingLists });
});

it('useReorderReadingListItems rewrites the cached items at once and sends the ids', async () => {
  const rows = [
    { id: 1, kind: 'unavailable' as const },
    { id: 2, kind: 'unavailable' as const },
  ];
  const { result, queryClient } = renderHookWithProviders(() =>
    useReorderReadingListItems(4)
  );
  queryClient.setQueryData(queryKeys.readingListItems(4), { items: rows });
  await act(() => result.current.mutateAsync([2, 1]));
  expect(mocked.reorderReadingListItems).toHaveBeenCalledWith(4, [2, 1]);
  const cached = queryClient.getQueryData<{ items: { id: number }[] }>(
    queryKeys.readingListItems(4)
  );
  expect(cached?.items.map((row) => row.id)).toEqual([2, 1]);
});

it.each([
  [
    'useMyReadingLists',
    () => useMyReadingLists({ bookId: 7 }, false),
    () => mocked.listMyReadingLists,
  ],
  [
    'useReadingListItems',
    () => useReadingListItems(4, false),
    () => mocked.listReadingListItems,
  ],
])('%s stays idle while disabled', (_name, useHook, api) => {
  renderHookWithProviders(() => useHook() as never);
  expect(api()).not.toHaveBeenCalled();
});

it('useReadingListsByBook asks for the Book at the given page and refetches when an item is added to any list', async () => {
  mocked.listReadingLists.mockResolvedValue({
    items: [],
    total: 0,
    current: 2,
    pageSize: 10,
  });
  const { result } = renderHookWithProviders(() => ({
    lists: useReadingListsByBook(7, 2, 10),
    add: useToggleListItem({ bookId: 7 }),
  }));
  await waitFor(() => expect(result.current.lists.isSuccess).toBe(true));
  expect(mocked.listReadingLists).toHaveBeenCalledWith({
    bookId: 7,
    current: 2,
    pageSize: 10,
  });

  await act(() => result.current.add.mutateAsync({ listId: 4, itemId: null }));

  await waitFor(() => expect(mocked.listReadingLists).toHaveBeenCalledTimes(2));
});
