process.env.NODE_ENV ??= 'test';

import { after, before, beforeEach, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import mysql from 'mysql2/promise';
import type { Sequelize } from 'sequelize';
import { createSequelize } from '../db/sequelize.ts';
import { ensureDatabase } from '../db/ensureDatabase.ts';
import { parseConfig } from '../db/config.ts';
import {
  Book,
  initModels,
  Series,
  SeriesAuthor,
  User,
} from '../models/index.ts';
import { createCreditedBook } from '../models/creditedBook.testkit.ts';
import { AppError, NotFoundError } from '../types/errors.ts';
import { createSequelizeSeriesRepository } from './seriesRepository.ts';

// A schema of its own rather than the users suite's: node:test runs spec
// files in parallel processes, and two suites calling sync({ force: true })
// on one database would drop each other's tables mid-run.
const TEST_DB_NAME = `${process.env.TEST_DB_NAME ?? 'books_demo_spa_test'}_series`;

function testDbConfig() {
  const config = parseConfig({
    ...process.env,
    NODE_ENV: 'test',
    DB_NAME: TEST_DB_NAME,
  });
  return config.db;
}

async function probe(): Promise<true | string> {
  if (!process.env.DB_USER)
    return 'DB_USER is not set — configure server/.env.local';
  try {
    const db = testDbConfig();
    const connection = await mysql.createConnection({
      host: db.host,
      port: db.port,
      user: db.username,
      password: db.password,
      connectTimeout: 4000,
    });
    await connection.end();
    return true;
  } catch (error) {
    return `MySQL unreachable: ${(error as Error).message}`;
  }
}

const reachable = await probe();
const skip = reachable === true ? false : reachable;

const owner = {
  login: 'SeriesOwner',
  email: 'owner@example.com',
  password: 'hunter2hunter2',
  firstName: 'Ola',
  lastName: 'Owner',
};

const coAuthor = {
  login: 'SeriesCoAuthor',
  email: 'series-coauthor@example.com',
  password: 'hunter2hunter2',
  firstName: 'Cora',
  lastName: 'Author',
};

describe('seriesRepository against real MySQL', { skip }, () => {
  let sequelize: Sequelize;
  let ownerId: number;
  const repository = createSequelizeSeriesRepository();

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
    // Children first: the foreign keys forbid clearing users out from under
    // them. Books are cleared by hand, since a series only unlinks its books.
    await Book.destroy({ where: {}, truncate: false });
    await Series.destroy({ where: {}, truncate: false });
    await User.destroy({ where: {}, truncate: false });
    ownerId = (await User.create(owner)).id;
  });

  test('creating a series credits its creator as its only co-author', async () => {
    const created = await repository.create({
      userId: ownerId,
      title: 'Test Series',
      description: 'Solo',
      tags: [],
    });

    const expected = [
      {
        id: ownerId,
        login: 'SeriesOwner',
        firstName: 'Ola',
        lastName: 'Owner',
      },
    ];
    assert.deepEqual(created.authors, expected);
    assert.deepEqual(
      (await repository.findById(created.id))?.authors,
      expected
    );
  });

  test('a co-author is credited after the ones already there', async () => {
    const coAuthorId = (await User.create({ ...coAuthor, role: 'author' })).id;
    const created = await repository.create({
      userId: ownerId,
      title: 'Test Series',
      description: 'Shared',
      tags: [],
    });

    const updated = await repository.addCoAuthor(created.id, coAuthorId);

    assert.deepEqual(
      updated?.authors.map((author) => author.login),
      ['SeriesOwner', 'SeriesCoAuthor']
    );
  });

  test('only an account holding the author role can be made a co-author', async () => {
    const readerId = (await User.create({ ...coAuthor, role: 'user' })).id;
    const created = await repository.create({
      userId: ownerId,
      title: 'Test Series',
      description: 'Shared',
      tags: [],
    });

    await assert.rejects(
      repository.addCoAuthor(created.id, readerId),
      (error: unknown) =>
        error instanceof AppError &&
        error.statusCode === 400 &&
        /author role/i.test(error.message)
    );
    assert.equal((await repository.findById(created.id))?.authors.length, 1);
  });

  test('crediting an account that does not exist blames the user', async () => {
    const created = await repository.create({
      userId: ownerId,
      title: 'Test Series',
      description: 'Shared',
      tags: [],
    });

    await assert.rejects(
      repository.addCoAuthor(created.id, ownerId + 10_000),
      (error: unknown) =>
        error instanceof NotFoundError &&
        /User \d+ not found/.test(error.message)
    );
  });

  test('crediting a co-author twice is a conflict', async () => {
    const coAuthorId = (await User.create({ ...coAuthor, role: 'author' })).id;
    const created = await repository.create({
      userId: ownerId,
      title: 'Test Series',
      description: 'Shared',
      tags: [],
    });
    await repository.addCoAuthor(created.id, coAuthorId);

    await assert.rejects(
      repository.addCoAuthor(created.id, coAuthorId),
      (error: unknown) => error instanceof AppError && error.statusCode === 409
    );
  });

  test('removing a co-author leaves the rest credited', async () => {
    const coAuthorId = (await User.create({ ...coAuthor, role: 'author' })).id;
    const created = await repository.create({
      userId: ownerId,
      title: 'Test Series',
      description: 'Shared',
      tags: [],
    });
    await repository.addCoAuthor(created.id, coAuthorId);

    const updated = await repository.removeCoAuthor(created.id, ownerId);

    assert.deepEqual(
      updated?.authors.map((author) => author.id),
      [coAuthorId]
    );
  });

  test('the last co-author cannot be removed', async () => {
    const created = await repository.create({
      userId: ownerId,
      title: 'Test Series',
      description: 'Solo',
      tags: [],
    });

    await assert.rejects(
      repository.removeCoAuthor(created.id, ownerId),
      (error: unknown) =>
        error instanceof AppError &&
        error.statusCode === 409 &&
        /last co-author/i.test(error.message)
    );
    assert.equal((await repository.findById(created.id))?.authors.length, 1);
  });

  test('removing an account that is not credited is a 404, even on a solo series', async () => {
    const strangerId = (await User.create({ ...coAuthor, role: 'author' })).id;
    const created = await repository.create({
      userId: ownerId,
      title: 'Test Series',
      description: 'Solo',
      tags: [],
    });

    await assert.rejects(
      repository.removeCoAuthor(created.id, strangerId),
      (error: unknown) =>
        error instanceof NotFoundError &&
        /Co-author \d+ not found/.test(error.message)
    );
  });

  test('the userId filter matches a series through any of its co-authors', async () => {
    const coAuthorId = (await User.create({ ...coAuthor, role: 'author' })).id;
    const shared = await repository.create({
      userId: ownerId,
      title: 'Shared Series',
      description: 'Shared',
      tags: [],
    });
    await repository.addCoAuthor(shared.id, coAuthorId);
    await repository.create({
      userId: ownerId,
      title: 'Solo Series',
      description: 'Solo',
      tags: [],
    });

    const page = await repository.list({
      limit: 20,
      offset: 0,
      userId: coAuthorId,
    });

    assert.equal(page.total, 1);
    assert.equal(page.items[0]?.title, 'Shared Series');
  });

  test('removing a book from a series unlinks it and leaves the book standing', async () => {
    const created = await repository.create({
      userId: ownerId,
      title: 'Test Series',
      description: 'Holds a book',
      tags: [],
    });
    const filed = await createCreditedBook(
      {
        title: 'Filed',
        description: 'In the series',
        tags: [],
        seriesId: created.id,
      },
      [ownerId]
    );

    assert.equal(await repository.removeBook(created.id, filed.id), true);

    assert.equal((await Book.findByPk(filed.id))?.seriesId, null);
  });

  test('removing a book that is not in the series is a 404 on the book', async () => {
    const created = await repository.create({
      userId: ownerId,
      title: 'Test Series',
      description: 'Empty',
      tags: [],
    });
    const standalone = await createCreditedBook(
      { title: 'Standalone', description: 'In no series', tags: [] },
      [ownerId]
    );

    await assert.rejects(
      repository.removeBook(created.id, standalone.id),
      (error: unknown) =>
        error instanceof NotFoundError &&
        /Book \d+ not found/.test(error.message)
    );
    assert.equal(
      await repository.removeBook(created.id + 10_000, standalone.id),
      false
    );
  });

  test('round-trips tags through the JSON column as a real array', async () => {
    const created = await repository.create({
      userId: ownerId,
      title: 'Test Series',
      description: 'A space opera',
      tags: ['sci-fi', 'epic'],
    });

    const reloaded = await repository.findById(created.id);

    assert.ok(Array.isArray(reloaded?.tags));
    assert.deepEqual(reloaded?.tags, ['sci-fi', 'epic']);
  });

  test('stores an empty tag list without a DDL default', async () => {
    const created = await repository.create({
      userId: ownerId,
      title: 'Test Series',
      description: 'No tags',
      tags: [],
    });

    assert.deepEqual((await repository.findById(created.id))?.tags, []);
  });

  test('tags survive multi-byte characters, thanks to utf8mb4', async () => {
    const created = await repository.create({
      userId: ownerId,
      title: 'Test Series',
      description: 'Epic 📚',
      tags: ['sci-fi', '📚'],
    });

    const reloaded = await repository.findById(created.id);

    assert.equal(reloaded?.description, 'Epic 📚');
    assert.deepEqual(reloaded?.tags, ['sci-fi', '📚']);
  });

  test('a create against an unknown user surfaces as NotFoundError, not a raw FK error', async () => {
    await assert.rejects(
      repository.create({
        userId: ownerId + 10_000,
        title: 'Test Series',
        description: 'Orphan',
        tags: [],
      }),
      (error: unknown) =>
        error instanceof NotFoundError &&
        /User \d+ not found/.test(error.message)
    );
  });

  test('the tag filter matches through JSON_CONTAINS, not a substring', async () => {
    await repository.create({
      userId: ownerId,
      title: 'Test Series',
      description: 'Tagged epic',
      tags: ['epic'],
    });
    await repository.create({
      userId: ownerId,
      title: 'Test Series',
      description: 'Tagged epic-fantasy',
      tags: ['epic-fantasy'],
    });

    const exact = await repository.list({ limit: 20, offset: 0, tag: 'epic' });

    // A LIKE-based implementation would return both rows here.
    assert.equal(exact.total, 1);
    assert.equal(exact.items[0]?.description, 'Tagged epic');
  });

  test('the description search treats LIKE metacharacters literally', async () => {
    await repository.create({
      userId: ownerId,
      title: 'Test Series',
      description: 'Contains a 100% real percent sign',
      tags: [],
    });
    await repository.create({
      userId: ownerId,
      title: 'Test Series',
      description: 'No metacharacter here',
      tags: [],
    });

    const matches = await repository.list({ limit: 20, offset: 0, q: '%' });

    assert.equal(matches.total, 1);
    assert.match(matches.items[0]?.description ?? '', /100% real/);
  });

  test('the co-author filter and paging envelope agree on the total', async () => {
    const otherId = (
      await User.create({
        ...owner,
        login: 'OtherOwner',
        email: 'other@example.com',
      })
    ).id;

    for (const description of ['One', 'Two', 'Three']) {
      await repository.create({
        userId: ownerId,
        title: description,
        description,
        tags: [],
      });
    }
    await repository.create({
      userId: otherId,
      title: 'Theirs',
      description: 'Theirs',
      tags: [],
    });

    const page = await repository.list({
      limit: 2,
      offset: 0,
      userId: ownerId,
    });

    assert.equal(page.total, 3);
    assert.equal(page.items.length, 2);
  });

  test('an update replaces the whole tag array and leaves the co-authors alone', async () => {
    const created = await repository.create({
      userId: ownerId,
      title: 'Test Series',
      description: 'Original',
      tags: ['sci-fi', 'epic'],
    });

    const updated = await repository.update(created.id, { tags: ['drama'] });

    assert.deepEqual(updated?.tags, ['drama']);
    assert.deepEqual(
      updated?.authors.map((author) => author.id),
      [ownerId]
    );
    assert.equal(updated?.description, 'Original');
  });

  test('an update omitting tags leaves the stored ones untouched', async () => {
    const created = await repository.create({
      userId: ownerId,
      title: 'Test Series',
      description: 'Original',
      tags: ['sci-fi'],
    });

    const updated = await repository.update(created.id, {
      description: 'Rewritten',
    });

    assert.equal(updated?.description, 'Rewritten');
    assert.deepEqual(updated?.tags, ['sci-fi']);
  });

  // The foreign key alone only drops the credit. Whether the series goes too is
  // userRepository.remove's decision, covered in userRepository.spec.ts.
  test('deleting a user row drops their credits and nothing else', async () => {
    const created = await repository.create({
      userId: ownerId,
      title: 'Test Series',
      description: 'Credited',
      tags: [],
    });

    await User.destroy({ where: { id: ownerId } });

    assert.equal(await SeriesAuthor.count(), 0);
    assert.ok(await Series.findByPk(created.id));
  });

  test('deleting a series drops its credits', async () => {
    const created = await repository.create({
      userId: ownerId,
      title: 'Test Series',
      description: 'Doomed',
      tags: [],
    });

    assert.equal(await repository.remove(created.id), true);
    assert.equal(await SeriesAuthor.count(), 0);
  });
});
