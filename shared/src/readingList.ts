import type { PublicBook } from './book.ts';
import type { PublicSeries } from './series.ts';

// Reading list (CONTEXT.md): the longest a title may be.
export const READING_LIST_TITLE_MAX_LENGTH = 200;
// Reading list (CONTEXT.md): the most items one list holds.
export const READING_LIST_MAX_ITEMS = 100;

// Reading list (CONTEXT.md): the Account that owns a list.
interface ReadingListOwner {
  id: number;
  login: string;
}

// Reading list (CONTEXT.md): one row of the paged list. `itemCount` counts
// only the items the viewer may see.
export interface PublicReadingList {
  id: number;
  owner: ReadingListOwner;
  title: string;
  description: string;
  tags: string[];
  itemCount: number;
  createdAt: Date;
  updatedAt: Date;
}

// Reading list (CONTEXT.md): `id` is the item row's id, the one DELETE and
// reorder take.
export type ReadingListItem =
  | { id: number; kind: 'book'; book: PublicBook }
  | { id: number; kind: 'series'; series: PublicSeries };

// Reading list (CONTEXT.md): a list with its shown items, in order.
export interface ReadingListDetail extends PublicReadingList {
  items: ReadingListItem[];
}

// Reading list (CONTEXT.md): the owner's full list; an unavailable item
// carries no title.
export type ReadingListEditItem =
  ReadingListItem | { id: number; kind: 'unavailable' };

// Reading list (CONTEXT.md): one of the viewer's lists, with `itemId` the row
// holding the asked work, or null.
export interface MyReadingList {
  id: number;
  title: string;
  itemCount: number;
  itemId: number | null;
}

// Reading list (CONTEXT.md): the POST body; PATCH takes a Partial.
export interface ReadingListPayload {
  title: string;
  description?: string;
  tags?: string[];
}

// Reading list (CONTEXT.md): exactly one work per item.
export type AddReadingListItemPayload =
  { bookId: number } | { seriesId: number };

// Reading list (CONTEXT.md): the whole item order, first item first.
export interface ReorderReadingListItemsPayload {
  itemIds: number[];
}
