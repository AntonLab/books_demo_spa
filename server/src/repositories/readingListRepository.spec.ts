process.env.NODE_ENV ??= 'test';

import { after, before, beforeEach, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { UniqueConstraintError, type Sequelize } from 'sequelize';
import { READING_LIST_MAX_ITEMS, READING_LIST_MAX_PER_ACCOUNT } from 'shared';
import { createSequelize } from '../db/sequelize.ts';
import { ensureDatabase } from '../db/ensureDatabase.ts';
import { testDbConfig } from '../db/testDb.testkit.ts';
import { skipWithoutMysql } from '../db/mysqlProbe.testkit.ts';
import { initModels } from '../models/index.ts';
import { Book } from '../models/Book.ts';
import { ReadingList } from '../models/ReadingList.ts';
import { ReadingListItem } from '../models/ReadingListItem.ts';
import { Series } from '../models/Series.ts';
import { User } from '../models/User.ts';
import {
  createCreditedBook,
  createCreditedSeries,
} from '../models/creditedBook.testkit.ts';
import { createSequelizeReadingListRepository } from './readingListRepository.ts';
import {
  as,
  readingListContract,
  type ReadingListContractWorld,
} from './readingListRepository.contract.testkit.ts';
import { readingListCopyContract } from './readingListRepository.copy.contract.testkit.ts';
import { readingListItemsContract } from './readingListRepository.items.contract.testkit.ts';

const skip = await skipWithoutMysql();

const NEW_LIST = { title: 'Cold nights', description: '', tags: [] };

let accountCount = 0;
async function createAccount(role: 'user' | 'author' = 'user') {
  accountCount += 1;
  return User.create({
    login: `ListOwner${accountCount}`,
    email: `list-owner-${accountCount}@example.com`,
    password: 'hunter2hunter2',
    firstName: 'Lee',
    lastName: `Owner${accountCount}`,
    role,
    status: 'active',
  });
}

describe('readingListRepository against real MySQL', { skip }, () => {
  let sequelize: Sequelize;
  const repository = createSequelizeReadingListRepository();

  before(async () => {
    const db = testDbConfig('reading_lists');
    await ensureDatabase(db);
    sequelize = createSequelize(db);
    initModels(sequelize);
    await sequelize.sync({ force: true });
  });

  after(async () => {
    await sequelize.close();
  });

  beforeEach(async () => {
    // Children first: the foreign keys forbid clearing parents out from under
    // them.
    await ReadingListItem.destroy({ where: {}, truncate: false });
    await ReadingList.destroy({ where: {}, truncate: false });
    await Book.destroy({ where: {}, truncate: false });
    await Series.destroy({ where: {}, truncate: false });
    await User.destroy({ where: {}, truncate: false });
  });

  const setUp = async (): Promise<ReadingListContractWorld> => {
    let author: User | undefined;
    const anAuthor = async () => (author ??= await createAccount('author'));
    return {
      repository,
      async anAccount() {
        return (await createAccount()).id;
      },
      async aBook() {
        const { id } = await anAuthor();
        const book = await createCreditedBook(
          { title: 'Contract Book', description: 'x', tags: [] },
          [id]
        );
        return book.id;
      },
      async aSeries() {
        const { id } = await anAuthor();
        const series = await createCreditedSeries(
          { title: 'Contract Series', description: 'x', tags: [] },
          [id]
        );
        await createCreditedBook(
          {
            title: 'Contract Series Book',
            description: 'x',
            tags: [],
            seriesId: series.id,
          },
          [id]
        );
        return series.id;
      },
      async setBookDraft(id, draft) {
        await Book.update(
          { status: draft ? 'draft' : 'in_progress' },
          { where: { id } }
        );
      },
      async setSeriesPublic(seriesId, isPublic) {
        await Book.update(
          { status: isPublic ? 'in_progress' : 'draft' },
          { where: { seriesId } }
        );
      },
      async pause() {
        await new Promise((resolve) => setTimeout(resolve, 5));
      },
    };
  };

  readingListContract(setUp);
  readingListItemsContract(setUp);
  readingListCopyContract(setUp);

  test('the owner carries its first and last name, not its login', async () => {
    const owner = await createAccount();
    const created = await repository.create(NEW_LIST, as(owner.id));
    assert.deepEqual(created.owner, {
      id: owner.id,
      firstName: 'Lee',
      lastName: owner.lastName,
      status: 'active',
    });
  });

  test('the owner carries its status, Pending included, on create, findById and listByOwner', async () => {
    const owner = await createAccount();
    await owner.update({ status: 'pending' });
    const created = await repository.create(NEW_LIST, as(owner.id));
    const found = await repository.findById(created.id);
    const listed = await repository.listByOwner({
      userId: owner.id,
      current: 1,
      pageSize: 10,
    });
    assert.deepEqual(
      [
        created.owner.status,
        found?.owner.status,
        listed.items[0]?.owner.status,
      ],
      ['pending', 'pending', 'pending']
    );
  });

  test('the owner carries its status on listByBook and update, Blocked included', async () => {
    const world = await setUp();
    const bookId = await world.aBook();
    const owner = await createAccount();
    const { id } = await repository.create(NEW_LIST, as(owner.id));
    await repository.addItem(id, as(owner.id), { bookId, seriesId: null });
    const statusOnBoth = async () => [
      (await repository.listByBook({ bookId, current: 1, pageSize: 10 }))
        .items[0]?.owner.status,
      (await repository.update(id, as(owner.id), { title: 'Renamed' })).owner
        .status,
    ];
    assert.deepEqual(await statusOnBoth(), ['active', 'active']);
    await owner.update({ status: 'blocked' });
    assert.deepEqual(await statusOnBoth(), ['blocked', 'blocked']);
  });

  test('deleting an account deletes its lists and their items, and keeps the works', async () => {
    const world = await setUp();
    const ownerId = await world.anAccount();
    const bookId = await world.aBook();
    const list = await world.repository.create(NEW_LIST, as(ownerId));
    await world.repository.addItem(list.id, as(ownerId), {
      bookId,
      seriesId: null,
    });
    await User.destroy({ where: { id: ownerId } });
    assert.deepEqual(
      [await ReadingList.count(), await ReadingListItem.count()],
      [0, 0]
    );
    assert.equal(await Book.count({ where: { id: bookId } }), 1);
  });

  test('deleting a Book or a Series removes its items from every list and only those', async () => {
    const world = await setUp();
    const [a, b] = [await world.anAccount(), await world.anAccount()];
    const [bookId, otherBook, seriesId] = [
      await world.aBook(),
      await world.aBook(),
      await world.aSeries(),
    ];
    for (const owner of [a, b]) {
      const { id } = await world.repository.create(NEW_LIST, as(owner));
      for (const target of [
        { bookId, seriesId: null },
        { bookId: otherBook, seriesId: null },
        { bookId: null, seriesId },
      ]) {
        await world.repository.addItem(id, as(owner), target);
      }
    }
    await Book.destroy({ where: { id: bookId } });
    assert.equal(await ReadingListItem.count({ where: { bookId } }), 0);
    await Series.destroy({ where: { id: seriesId } });
    assert.equal(await ReadingListItem.count({ where: { seriesId } }), 0);
    assert.equal(
      await ReadingListItem.count({ where: { bookId: otherBook } }),
      2
    );
  });

  test('the unique indexes refuse a second row for one work in one list, even past the repository', async () => {
    const world = await setUp();
    const ownerId = await world.anAccount();
    const bookId = await world.aBook();
    const { id: listId } = await world.repository.create(NEW_LIST, as(ownerId));
    await ReadingListItem.create({ listId, bookId, position: 1 });
    await assert.rejects(
      ReadingListItem.create({ listId, bookId, position: 2 }),
      UniqueConstraintError
    );
  });

  test('two creates racing for the last list: the account ends with 50, not 51', async () => {
    const world = await setUp();
    const ownerId = await world.anAccount();
    for (let i = 0; i < READING_LIST_MAX_PER_ACCOUNT - 1; i += 1) {
      await world.repository.create(NEW_LIST, as(ownerId));
    }
    const results = await Promise.allSettled([
      world.repository.create(NEW_LIST, as(ownerId)),
      world.repository.create(NEW_LIST, as(ownerId)),
    ]);
    assert.deepEqual(results.map((r) => r.status).sort(), [
      'fulfilled',
      'rejected',
    ]);
    assert.equal(
      await ReadingList.count({ where: { userId: ownerId } }),
      READING_LIST_MAX_PER_ACCOUNT
    );
  });

  test('two adds racing for the last place: exactly one lands', async () => {
    const world = await setUp();
    const ownerId = await world.anAccount();
    const { id } = await world.repository.create(NEW_LIST, as(ownerId));
    for (let i = 0; i < READING_LIST_MAX_ITEMS - 1; i += 1) {
      await world.repository.addItem(id, as(ownerId), {
        bookId: await world.aBook(),
        seriesId: null,
      });
    }
    const [x, y] = [await world.aBook(), await world.aBook()];
    const results = await Promise.allSettled(
      [x, y].map((bookId) =>
        world.repository.addItem(id, as(ownerId), { bookId, seriesId: null })
      )
    );
    assert.deepEqual(results.map((r) => r.status).sort(), [
      'fulfilled',
      'rejected',
    ]);
    assert.equal(
      await ReadingListItem.count({ where: { listId: id } }),
      READING_LIST_MAX_ITEMS
    );
  });
});
