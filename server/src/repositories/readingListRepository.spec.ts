process.env.NODE_ENV ??= 'test';

import { after, before, beforeEach, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { UniqueConstraintError, type Sequelize } from 'sequelize';
import { READING_LIST_MAX_ITEMS } from 'shared';
import { createSequelize } from '../db/sequelize.ts';
import { ensureDatabase } from '../db/ensureDatabase.ts';
import { parseConfig } from '../db/config.ts';
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

// A schema of its own: node:test runs spec files in parallel processes, and
// two suites calling sync({ force: true }) on one database drop each other's
// tables mid-run.
const TEST_DB_NAME = `${process.env.TEST_DB_NAME ?? 'books_demo_spa_test'}_reading_lists`;

function testDbConfig() {
  const config = parseConfig({
    ...process.env,
    NODE_ENV: 'test',
    DB_NAME: TEST_DB_NAME,
  });
  return config.db;
}

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
  });
}

describe('readingListRepository against real MySQL', { skip }, () => {
  let sequelize: Sequelize;
  const repository = createSequelizeReadingListRepository();

  before(async () => {
    const db = testDbConfig();
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
