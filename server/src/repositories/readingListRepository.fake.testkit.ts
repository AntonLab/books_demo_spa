import {
  READING_LIST_MAX_ITEMS,
  type PublicBook,
  type PublicReadingList,
  type PublicSeries,
  type ReadingListEditItem,
  type ReadingListItem,
} from 'shared';
import {
  BadRequestError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
  StateConflictError,
} from '../types/errors.ts';
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
  // Order within the list: gaps after a removal are fine.
  position: number;
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
  let nextItemId = 1;
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

  const rowsOf = (listId: number): ItemRow[] =>
    [...items.values()]
      .filter((row) => row.listId === listId)
      .sort((a, b) => a.position - b.position);

  const shownItems = (listId: number): ReadingListItem[] =>
    rowsOf(listId).flatMap((row): ReadingListItem[] => {
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

  const repository: ReadingListRepository = {
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

    async listEditItems(id, account) {
      ownedBy(id, account);
      const shown = new Map(shownItems(id).map((item) => [item.id, item]));
      return rowsOf(id).map(
        (row): ReadingListEditItem =>
          shown.get(row.id) ?? { id: row.id, kind: 'unavailable' }
      );
    },

    async addItem(id, account, target) {
      const list = ownedBy(id, account);
      if (target.bookId !== null) {
        if (!books.has(target.bookId) || hiddenBooks.has(target.bookId)) {
          throw new NotFoundError('Book', target.bookId);
        }
      } else if (
        target.seriesId === null ||
        !series.has(target.seriesId) ||
        hiddenSeries.has(target.seriesId)
      ) {
        throw new NotFoundError('Series', target.seriesId ?? 0);
      }
      const rows = rowsOf(id);
      if (
        rows.some(
          (row) =>
            row.bookId === target.bookId && row.seriesId === target.seriesId
        )
      ) {
        throw new ConflictError('reading list item');
      }
      if (rows.length >= READING_LIST_MAX_ITEMS) {
        throw new BadRequestError(
          `A reading list holds at most ${READING_LIST_MAX_ITEMS} items`
        );
      }
      const row: ItemRow = {
        id: nextItemId++,
        listId: id,
        bookId: target.bookId,
        seriesId: target.seriesId,
        position: Math.max(0, ...rows.map((r) => r.position)) + 1,
      };
      items.set(row.id, row);
      list.updatedAt = now();
      const added = shownItems(id).find((item) => item.id === row.id);
      if (!added) throw new Error('added item is not shown');
      return added;
    },

    async removeItem(id, itemId, account) {
      const list = ownedBy(id, account);
      if (items.get(itemId)?.listId === id) {
        items.delete(itemId);
        list.updatedAt = now();
      }
    },

    async reorderItems(id, account, itemIds) {
      const list = ownedBy(id, account);
      const rows = rowsOf(id);
      const given = [...itemIds].sort((a, b) => a - b);
      const held = rows.map((row) => row.id).sort((a, b) => a - b);
      if (given.join() !== held.join()) {
        throw new StateConflictError(
          'The item set does not match the reading list'
        );
      }
      itemIds.forEach((itemId, index) => {
        const row = items.get(itemId);
        if (row) row.position = index + 1;
      });
      list.updatedAt = now();
    },

    async copy(id, account) {
      const source = lists.get(id);
      if (!source) throw new NotFoundError('ReadingList', id);
      const shown = shownItems(id);
      const copy = await repository.create(
        {
          title: source.title,
          description: source.description,
          tags: [...source.tags],
        },
        account
      );
      shown.forEach((item, index) => {
        const row: ItemRow = {
          id: nextItemId++,
          listId: copy.id,
          bookId: item.kind === 'book' ? item.book.id : null,
          seriesId: item.kind === 'series' ? item.series.id : null,
          position: index + 1,
        };
        items.set(row.id, row);
      });
      const detail = await repository.findById(copy.id);
      if (!detail) throw new Error('copied list is missing');
      return detail;
    },

    async listMine(query, account) {
      return [...lists.values()]
        .filter((list) => list.userId === account.id)
        .sort(
          (a, b) => b.updatedAt.getTime() - a.updatedAt.getTime() || b.id - a.id
        )
        .map((list) => ({
          ...toPublic(list),
          itemId:
            rowsOf(list.id).find((row) =>
              query.bookId !== undefined
                ? row.bookId === query.bookId
                : query.seriesId !== undefined &&
                  row.seriesId === query.seriesId
            )?.id ?? null,
        }));
    },
  };
  return repository;
}
