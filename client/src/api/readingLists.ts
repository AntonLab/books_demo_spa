import { request } from './client';
import type {
  AddReadingListItemPayload,
  ItemsResponse,
  PagedResponse,
  ReadingListPayload,
  ReorderReadingListItemsPayload,
} from 'shared';
import type {
  MyReadingList,
  PublicReadingList,
  ReadingListDetail,
  ReadingListEditItem,
  ReadingListItem,
} from '../types/readingList';

export interface ListReadingListsParams {
  userId: number;
  // antd Pagination's names: the 1-based page and its size.
  current?: number;
  pageSize?: number;
}

export type WorkTarget = { bookId: number } | { seriesId: number };

const withQuery = (path: string, params: object): string => {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params) as [
    string,
    string | number | undefined,
  ][]) {
    if (value !== undefined) search.set(key, String(value));
  }
  const query = search.toString();
  return query ? `${path}?${query}` : path;
};

export const getReadingList = (id: number): Promise<ReadingListDetail> =>
  request<ReadingListDetail>(`/reading-lists/${id}`);

export const listReadingLists = (
  params: ListReadingListsParams
): Promise<PagedResponse<PublicReadingList>> =>
  request<PagedResponse<PublicReadingList>>(
    withQuery('/reading-lists', params)
  );

// Owner only: an item the owner cannot see comes back as 'unavailable'.
export const listReadingListItems = (
  id: number
): Promise<ItemsResponse<ReadingListEditItem>> =>
  request<ItemsResponse<ReadingListEditItem>>(`/reading-lists/${id}/items`);

export const listMyReadingLists = (
  target: WorkTarget
): Promise<ItemsResponse<MyReadingList>> =>
  request<ItemsResponse<MyReadingList>>(
    withQuery('/reading-lists/mine', target)
  );

export const createReadingList = (
  payload: ReadingListPayload
): Promise<PublicReadingList> =>
  request<PublicReadingList>('/reading-lists', {
    method: 'POST',
    body: payload,
  });

export const updateReadingList = (
  id: number,
  payload: Partial<ReadingListPayload>
): Promise<PublicReadingList> =>
  request<PublicReadingList>(`/reading-lists/${id}`, {
    method: 'PATCH',
    body: payload,
  });

// The server answers 204, which request() maps to undefined.
export const deleteReadingList = (id: number): Promise<void> =>
  request<void>(`/reading-lists/${id}`, { method: 'DELETE' });

export const addReadingListItem = (
  id: number,
  target: WorkTarget
): Promise<ReadingListItem> => {
  const payload: AddReadingListItemPayload = target;
  return request<ReadingListItem>(`/reading-lists/${id}/items`, {
    method: 'POST',
    body: payload,
  });
};

export const removeReadingListItem = (
  id: number,
  itemId: number
): Promise<void> =>
  request<void>(`/reading-lists/${id}/items/${itemId}`, { method: 'DELETE' });

export const reorderReadingListItems = (
  id: number,
  itemIds: number[]
): Promise<void> => {
  const payload: ReorderReadingListItemsPayload = { itemIds };
  return request<void>(`/reading-lists/${id}/item-order`, {
    method: 'PUT',
    body: payload,
  });
};

export const copyReadingList = (id: number): Promise<ReadingListDetail> =>
  request<ReadingListDetail>(`/reading-lists/${id}/copy`, { method: 'POST' });
