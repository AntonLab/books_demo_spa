import type {
  MyReadingList,
  PublicReadingList,
  ReadingListDetail,
  ReadingListEditItem,
  ReadingListItem,
} from 'shared';
import type {
  AddReadingListItemInput,
  CreateReadingListInput,
  ListReadingListsQuery,
  MyReadingListsQuery,
  UpdateReadingListInput,
} from '../types/readingList.ts';
import type { Viewer } from './visibility.ts';

// The signed-in account a Reading list belongs to. Never a Guest: every route
// that reaches this repository is guarded.
export type Account = NonNullable<Viewer>;

// Every method that takes an `account` answers NotFoundError('ReadingList', id)
// for a missing list first, then ForbiddenError when the account is not the
// owner. A Moderator has no override.
export interface ReadingListRepository {
  // NotFoundError('User', id) for an unknown account.
  create(
    input: CreateReadingListInput,
    account: Account
  ): Promise<PublicReadingList>;
  // Shown items only; null for a missing list. Public: no account.
  findById(id: number): Promise<ReadingListDetail | null>;
  // Newest `updatedAt` first, ties by id descending. An unknown owner is an
  // empty page.
  listByOwner(
    query: ListReadingListsQuery
  ): Promise<{ items: PublicReadingList[]; total: number }>;
  // 404 for a missing list, then 403 for a non-owner.
  update(
    id: number,
    account: Account,
    input: UpdateReadingListInput
  ): Promise<PublicReadingList>;
  // 404 for a missing list, then 403 for a non-owner.
  remove(id: number, account: Account): Promise<void>;
  // 404 for a missing list, then 403 for a non-owner. Hidden items come back
  // as `unavailable`.
  listEditItems(id: number, account: Account): Promise<ReadingListEditItem[]>;
  // 404 for a missing list, then 403 for a non-owner.
  addItem(
    id: number,
    account: Account,
    target: AddReadingListItemInput
  ): Promise<ReadingListItem>;
  // 404 for a missing list, then 403 for a non-owner.
  removeItem(id: number, itemId: number, account: Account): Promise<void>;
  // 404 for a missing list, then 403 for a non-owner.
  reorderItems(id: number, account: Account, itemIds: number[]): Promise<void>;
  // 404 for a missing list. Anyone may copy a list; the copy is the account's.
  copy(id: number, account: Account): Promise<ReadingListDetail>;
  // The account's own lists, newest `updatedAt` first.
  listMine(
    query: MyReadingListsQuery,
    account: Account
  ): Promise<MyReadingList[]>;
}
