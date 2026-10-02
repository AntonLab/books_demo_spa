import type {
  PublicBook,
  PublicReadingList,
  PublicSeries,
  ReadingListItem,
} from 'shared';
import { ForbiddenError, NotFoundError } from '../types/errors.ts';
import type {
  Account,
  ReadingListRepository,
} from './readingListRepository.ts';

export interface FakeReadingListRepositoryOptions {
  // The accounts that exist, with their logins. Stands in for users.
  accounts?: Map<number, string>;
  // The books and series that exist, as a list row embeds them.
  books?: Map<number, PublicBook>;
  series?: Map<number, PublicSeries>;
  // Works that exist but are hidden from the reader: a Draft book, a private
  // series. The fake emulates only the visibility the contract moves.
  hiddenBooks?: Set<number>;
  hiddenSeries?: Set<number>;
}

interface ListRow {
  id: number;
  userId: number;
  title: string;
  description: string;
  tags: string[];
  createdAt: Date;
  updatedAt: Date;
}

interface ItemRow {
  id: number;
  listId: number;
  bookId: number | null;
  seriesId: number | null;
}

// An in-memory ReadingListRepository for the route specs, held to the real one
// by readingListRepository.contract.testkit.ts.
export function createFakeReadingListRepository(
  options: FakeReadingListRepositoryOptions = {}
): ReadingListRepository {
  const {
    accounts = new Map(),
    books = new Map(),
    series = new Map(),
    hiddenBooks = new Set(),
    hiddenSeries = new Set(),
  } = options;
  const lists = new Map<number, ListRow>();
  const items = new Map<number, ItemRow>();
  let nextListId = 1;
  let tick = 0;
  // A distinct, increasing time per write, so ordering never depends on speed.
  const now = () => new Date(Date.UTC(2026, 0, 1) + tick++ * 1000);

  // 404 first, then 403: a Moderator has no override.
  const ownedBy = (id: number, account: Account): ListRow => {
    const list = lists.get(id);
    if (!list) throw new NotFoundError('ReadingList', id);
    if (list.userId !== account.id) throw new ForbiddenError();
    return list;
  };

  const shownItems = (listId: number): ReadingListItem[] =>
    [...items.values()]
      .filter((row) => row.listId === listId)
      .flatMap((row): ReadingListItem[] => {
        const book =
          row.bookId !== null && !hiddenBooks.has(row.bookId)
            ? books.get(row.bookId)
            : undefined;
        if (book) return [{ id: row.id, kind: 'book', book }];
        const found =
          row.seriesId !== null && !hiddenSeries.has(row.seriesId)
            ? series.get(row.seriesId)
            : undefined;
        return found ? [{ id: row.id, kind: 'series', series: found }] : [];
      });

  const toPublic = (list: ListRow): PublicReadingList => ({
    id: list.id,
    owner: { id: list.userId, login: accounts.get(list.userId) ?? '' },
    title: list.title,
    description: list.description,
    tags: list.tags,
    itemCount: shownItems(list.id).length,
    createdAt: list.createdAt,
    updatedAt: list.updatedAt,
  });

  return {
    async create(input, account) {
      if (!accounts.has(account.id)) {
        throw new NotFoundError('User', account.id);
      }
      const time = now();
      const list: ListRow = {
        id: nextListId++,
        userId: account.id,
        title: input.title,
        description: input.description,
        tags: input.tags,
        createdAt: time,
        updatedAt: time,
      };
      lists.set(list.id, list);
      return toPublic(list);
    },

    async findById(id) {
      const list = lists.get(id);
      return list ? { ...toPublic(list), items: shownItems(id) } : null;
    },

    async listByOwner(query) {
      const own = [...lists.values()]
        .filter((list) => list.userId === query.userId)
        .sort(
          (a, b) => b.updatedAt.getTime() - a.updatedAt.getTime() || b.id - a.id
        );
      const start = (query.current - 1) * query.pageSize;
      return {
        items: own.slice(start, start + query.pageSize).map(toPublic),
        total: own.length,
      };
    },

    async update(id, account, input) {
      const list = ownedBy(id, account);
      Object.assign(list, input, { updatedAt: now() });
      return toPublic(list);
    },

    async remove(id, account) {
      ownedBy(id, account);
      lists.delete(id);
      for (const [itemId, row] of items) {
        if (row.listId === id) items.delete(itemId);
      }
    },

    async listEditItems() {
      throw new Error('not implemented: Task 4');
    },
    async addItem() {
      throw new Error('not implemented: Task 4');
    },
    async removeItem() {
      throw new Error('not implemented: Task 4');
    },
    async reorderItems() {
      throw new Error('not implemented: Task 4');
    },
    async copy() {
      throw new Error('not implemented: Task 5');
    },
    async listMine() {
      throw new Error('not implemented: Task 5');
    },
  };
}
