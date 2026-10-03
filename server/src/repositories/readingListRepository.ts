import {
  col,
  fn,
  ForeignKeyConstraintError,
  Op,
  UniqueConstraintError,
  type Sequelize,
  type Transaction,
} from 'sequelize';
import {
  READING_LIST_MAX_ITEMS,
  type MyReadingList,
  type PublicReadingList,
  type ReadingListDetail,
  type ReadingListEditItem,
  type ReadingListItem,
} from 'shared';
import { Book } from '../models/Book.ts';
import { ReadingList } from '../models/ReadingList.ts';
import { ReadingListItem as ReadingListItemRow } from '../models/ReadingListItem.ts';
import { Series } from '../models/Series.ts';
import { User } from '../models/User.ts';
import {
  BadRequestError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
  StateConflictError,
} from '../types/errors.ts';
import type {
  AddReadingListItemInput,
  CreateReadingListInput,
  ListReadingListsQuery,
  MyReadingListsQuery,
  UpdateReadingListInput,
} from '../types/readingList.ts';
import { publicBooksOf } from './bookRepository.ts';
import { joined } from './joined.ts';
import { publicSeriesOf } from './seriesRepository.ts';
import { visibleSeriesWhere, type Viewer } from './visibility.ts';

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

function sequelizeOf(): Sequelize {
  const sequelize = ReadingList.sequelize;
  if (!sequelize) throw new Error('ReadingList model is not initialised');
  return sequelize;
}

const NEWEST_FIRST: [string, string][] = [
  ['updatedAt', 'DESC'],
  ['id', 'DESC'],
];

const withOwner = {
  model: User,
  as: 'owner',
  attributes: ['login'],
  required: true,
};

// 404 first, then 403: a Moderator has no override. With a transaction the row
// is locked, which serialises every write to one list.
async function ownedList(
  id: number,
  account: Account,
  transaction?: Transaction
): Promise<ReadingList> {
  const list = await ReadingList.findByPk(id, {
    include: [withOwner],
    transaction,
    // `of` keeps the lock on the list row, not the joined owner.
    lock: transaction && { level: transaction.LOCK.UPDATE, of: ReadingList },
  });
  if (!list) throw new NotFoundError('ReadingList', id);
  if (list.userId !== account.id) throw new ForbiddenError();
  return list;
}

function toPublicReadingList(
  list: ReadingList,
  ownerLogin: string,
  itemCount: number
): PublicReadingList {
  return {
    id: list.id,
    owner: { id: list.userId, login: ownerLogin },
    title: list.title,
    description: list.description,
    tags: list.tags,
    itemCount,
    createdAt: list.createdAt,
    updatedAt: list.updatedAt,
  };
}

// An item change is a change to the list. Model.update skips a statement whose
// only column is updatedAt, so the instance is saved with it marked changed.
async function touch(list: ReadingList, transaction?: Transaction) {
  list.changed('updatedAt', true);
  await list.save({ transaction });
}

// One row of a list with the work it points at, when that work is shown. A row
// whose work is missing from the result is hidden: a Draft book, a series with
// no Published book.
interface PlacedItem {
  id: number;
  bookId: number | null;
  seriesId: number | null;
  book?: Book;
  series?: Series;
}

async function placedItems(
  listId: number,
  transaction?: Transaction
): Promise<PlacedItem[]> {
  const rows = await ReadingListItemRow.findAll({
    where: { listId },
    order: [
      ['position', 'ASC'],
      ['id', 'ASC'],
    ],
    transaction,
  });
  const bookIds = rows.flatMap((row) =>
    row.bookId === null ? [] : [row.bookId]
  );
  const seriesIds = rows.flatMap((row) =>
    row.seriesId === null ? [] : [row.seriesId]
  );
  const [books, series] = await Promise.all([
    bookIds.length > 0
      ? Book.findAll({
          where: { id: bookIds, status: { [Op.ne]: 'draft' } },
          transaction,
        })
      : [],
    seriesIds.length > 0
      ? Series.findAll({
          where: {
            [Op.and]: [{ id: seriesIds }, await visibleSeriesWhere(null)],
          },
          transaction,
        })
      : [],
  ]);
  const bookById = new Map(books.map((book) => [book.id, book]));
  const seriesById = new Map(series.map((one) => [one.id, one]));
  return rows.map((row) => ({
    id: row.id,
    bookId: row.bookId,
    seriesId: row.seriesId,
    book: row.bookId === null ? undefined : bookById.get(row.bookId),
    series: row.seriesId === null ? undefined : seriesById.get(row.seriesId),
  }));
}

async function shownItemsOf(placed: PlacedItem[]): Promise<ReadingListItem[]> {
  const [books, series] = await Promise.all([
    publicBooksOf(placed.flatMap((item) => (item.book ? [item.book] : []))),
    publicSeriesOf(
      placed.flatMap((item) => (item.series ? [item.series] : []))
    ),
  ]);
  const bookById = new Map(books.map((book) => [book.id, book]));
  const seriesById = new Map(series.map((one) => [one.id, one]));
  return placed.flatMap((item): ReadingListItem[] => {
    const book = item.book && bookById.get(item.book.id);
    if (book) return [{ id: item.id, kind: 'book', book }];
    const one = item.series && seriesById.get(item.series.id);
    return one ? [{ id: item.id, kind: 'series', series: one }] : [];
  });
}

// Shown items per list, for the reads that page or list many lists: two
// grouped counts, one over the item rows whose Book is not a Draft, one over
// those whose Series is visible.
async function shownCounts(listIds: number[]): Promise<Map<number, number>> {
  const counts = new Map<number, number>();
  if (listIds.length === 0) return counts;
  const [books, series] = await Promise.all([
    ReadingListItemRow.count({
      where: { listId: listIds },
      include: [
        {
          model: Book,
          as: 'book',
          attributes: [],
          required: true,
          where: { status: { [Op.ne]: 'draft' } },
        },
      ],
      group: ['listId'],
    }),
    ReadingListItemRow.count({
      where: { listId: listIds },
      include: [
        {
          model: Series,
          as: 'series',
          attributes: [],
          required: true,
          where: await visibleSeriesWhere(null),
        },
      ],
      group: ['listId'],
    }),
  ]);
  for (const row of [...books, ...series]) {
    const listId = Number(row.listId);
    counts.set(listId, (counts.get(listId) ?? 0) + row.count);
  }
  return counts;
}

// A rejected foreign key means the work went away after the check in addItem.
// MySQL names the column in the constraint text, the only place the two are
// distinguishable.
function asMissingWork(error: unknown, target: AddReadingListItemInput): never {
  if (error instanceof ForeignKeyConstraintError) {
    const detail = `${error.index ?? ''} ${error.parent?.message ?? error.message}`;
    if (target.seriesId !== null && detail.includes('seriesId')) {
      throw new NotFoundError('Series', target.seriesId);
    }
    if (target.bookId !== null) throw new NotFoundError('Book', target.bookId);
  }
  throw error;
}

export function createSequelizeReadingListRepository(): ReadingListRepository {
  const repository: ReadingListRepository = {
    async create(input, account) {
      const owner = await User.findByPk(account.id, { attributes: ['login'] });
      if (!owner) throw new NotFoundError('User', account.id);
      const list = await ReadingList.create({ ...input, userId: account.id });
      return toPublicReadingList(list, owner.login, 0);
    },

    async findById(id) {
      const list = await ReadingList.findByPk(id, { include: [withOwner] });
      if (!list) return null;
      const items = await shownItemsOf(await placedItems(id));
      return {
        ...toPublicReadingList(list, joined(list.owner).login, items.length),
        items,
      };
    },

    async listByOwner(query) {
      const owner = await User.findByPk(query.userId, {
        attributes: ['login'],
      });
      if (!owner) return { items: [], total: 0 };
      const { rows, count } = await ReadingList.findAndCountAll({
        where: { userId: query.userId },
        order: NEWEST_FIRST,
        limit: query.pageSize,
        offset: (query.current - 1) * query.pageSize,
      });
      const counts = await shownCounts(rows.map((list) => list.id));
      return {
        items: rows.map((list) =>
          toPublicReadingList(list, owner.login, counts.get(list.id) ?? 0)
        ),
        total: count,
      };
    },

    async update(id, account, input) {
      const list = await ownedList(id, account);
      await list.update(input);
      const counts = await shownCounts([id]);
      return toPublicReadingList(
        list,
        joined(list.owner).login,
        counts.get(id) ?? 0
      );
    },

    async remove(id, account) {
      const list = await ownedList(id, account);
      await list.destroy();
    },

    async listEditItems(id, account) {
      await ownedList(id, account);
      const placed = await placedItems(id);
      const shown = new Map(
        (await shownItemsOf(placed)).map((item) => [item.id, item])
      );
      return placed.map(
        (item): ReadingListEditItem =>
          shown.get(item.id) ?? { id: item.id, kind: 'unavailable' }
      );
    },

    async addItem(id, account, target) {
      const { rowId, book, series } = await sequelizeOf().transaction(
        async (transaction) => {
          const list = await ownedList(id, account, transaction);

          // A work the reader may not see is the same 404 as a missing one.
          const book =
            target.bookId === null
              ? null
              : await Book.findOne({
                  where: { id: target.bookId, status: { [Op.ne]: 'draft' } },
                  transaction,
                });
          if (target.bookId !== null && !book) {
            throw new NotFoundError('Book', target.bookId);
          }
          const series =
            target.seriesId === null
              ? null
              : await Series.findOne({
                  where: {
                    [Op.and]: [
                      { id: target.seriesId },
                      await visibleSeriesWhere(null),
                    ],
                  },
                  transaction,
                });
          if (target.seriesId !== null && !series) {
            throw new NotFoundError('Series', target.seriesId);
          }

          // Hidden rows count: they come back when the work is shown again.
          const held = await ReadingListItemRow.count({
            where: { listId: id },
            transaction,
          });
          if (held >= READING_LIST_MAX_ITEMS) {
            throw new BadRequestError(
              `A reading list holds at most ${READING_LIST_MAX_ITEMS} items`
            );
          }
          const last = await ReadingListItemRow.max<number, ReadingListItemRow>(
            'position',
            { where: { listId: id }, transaction }
          );

          try {
            const row = await ReadingListItemRow.create(
              { listId: id, ...target, position: (Number(last) || 0) + 1 },
              { transaction }
            );
            await touch(list, transaction);
            return { rowId: row.id, book, series };
          } catch (error) {
            // One row per work per list comes from the unique indexes, never
            // a findOne first.
            if (error instanceof UniqueConstraintError) {
              throw new ConflictError('reading list item');
            }
            return asMissingWork(error, target);
          }
        }
      );

      if (book) {
        const [shown] = await publicBooksOf([book]);
        return { id: rowId, kind: 'book', book: joined(shown) };
      }
      const [shown] = await publicSeriesOf(series ? [series] : []);
      return { id: rowId, kind: 'series', series: joined(shown) };
    },

    async removeItem(id, itemId, account) {
      await sequelizeOf().transaction(async (transaction) => {
        const list = await ownedList(id, account, transaction);
        const removed = await ReadingListItemRow.destroy({
          where: { id: itemId, listId: id },
          transaction,
        });
        if (removed > 0) await touch(list, transaction);
      });
    },

    async reorderItems(id, account, itemIds) {
      await sequelizeOf().transaction(async (transaction) => {
        const list = await ownedList(id, account, transaction);
        const current = await ReadingListItemRow.findAll({
          where: { listId: id },
          attributes: ['id'],
          transaction,
        });
        const currentIds = new Set(current.map((row) => row.id));
        const sameSet =
          new Set(itemIds).size === itemIds.length &&
          itemIds.length === currentIds.size &&
          itemIds.every((itemId) => currentIds.has(itemId));
        if (!sameSet) {
          throw new StateConflictError(
            'The item set does not match the reading list'
          );
        }
        // One statement: FIELD(id, …) is each id's 1-based place. An item has
        // no dates, so silent only keeps the intent plain.
        await ReadingListItemRow.update(
          { position: fn('FIELD', col('id'), ...itemIds) },
          // The model validator reads bookId and seriesId, which a position
          // update leaves out.
          { where: { listId: id }, transaction, silent: true, validate: false }
        );
        await touch(list, transaction);
      });
    },

    async copy(id, account) {
      const copyId = await sequelizeOf().transaction(async (transaction) => {
        const source = await ReadingList.findByPk(id, { transaction });
        if (!source) throw new NotFoundError('ReadingList', id);
        const shown = (await placedItems(id, transaction)).filter(
          (item) => item.book ?? item.series
        );
        const owner = await User.findByPk(account.id, {
          attributes: ['id'],
          transaction,
        });
        if (!owner) throw new NotFoundError('User', account.id);
        const copy = await ReadingList.create(
          {
            userId: account.id,
            title: source.title,
            description: source.description,
            tags: source.tags,
          },
          { transaction }
        );
        await ReadingListItemRow.bulkCreate(
          shown.map((item, index) => ({
            listId: copy.id,
            bookId: item.bookId,
            seriesId: item.seriesId,
            position: index + 1,
          })),
          { transaction }
        );
        return copy.id;
      });
      const detail = await repository.findById(copyId);
      if (!detail) throw new Error('A copied list vanished before it was read');
      return detail;
    },

    async listMine(query, account) {
      const lists = await ReadingList.findAll({
        where: { userId: account.id },
        order: NEWEST_FIRST,
      });
      const ids = lists.map((list) => list.id);
      const counts = await shownCounts(ids);
      const holders = new Map<number, number>();
      const workKey =
        query.bookId !== undefined
          ? { bookId: query.bookId }
          : query.seriesId !== undefined
            ? { seriesId: query.seriesId }
            : null;
      if (workKey && ids.length > 0) {
        const rows = await ReadingListItemRow.findAll({
          where: { listId: ids, ...workKey },
          attributes: ['id', 'listId'],
        });
        for (const row of rows) holders.set(row.listId, row.id);
      }
      return lists.map((list) => ({
        id: list.id,
        title: list.title,
        itemCount: counts.get(list.id) ?? 0,
        itemId: holders.get(list.id) ?? null,
      }));
    },
  };
  return repository;
}
