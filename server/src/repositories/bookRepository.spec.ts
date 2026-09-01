process.env.NODE_ENV ??= 'test';

import { after, before, beforeEach, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import mysql from 'mysql2/promise';
import type { Sequelize } from 'sequelize';
import { createSequelize } from '../db/sequelize.ts';
import { ensureDatabase } from '../db/ensureDatabase.ts';
import { parseConfig } from '../db/config.ts';
import { Book, initModels, Series, User } from '../models/index.ts';
import { NotFoundError } from '../types/errors.ts';
import { createSequelizeBookRepository } from './bookRepository.ts';

// A schema of its own rather than the users' or series' suite: node:test runs
// spec files in parallel processes, and two suites calling sync({ force: true })
// on one database would drop each other's tables mid-run.
const TEST_DB_NAME = `${process.env.TEST_DB_NAME ?? 'books_demo_spa_test'}_books`;

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
  login: 'BookOwner',
  email: 'owner@example.com',
  password: 'hunter2hunter2',
  firstName: 'Ola',
  lastName: 'Owner',
};

describe('bookRepository against real MySQL', { skip }, () => {
  let sequelize: Sequelize;
  let ownerId: number;
  let seriesId: number;
  const repository = createSequelizeBookRepository();

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
    // them.
    await Book.destroy({ where: {}, truncate: false });
    await Series.destroy({ where: {}, truncate: false });
    await User.destroy({ where: {}, truncate: false });
    ownerId = (await User.create(owner)).id;
    seriesId = (
      await Series.create({
        userId: ownerId,
        description: 'A trilogy',
        tags: [],
      })
    ).id;
  });

  test('round-trips tags through the JSON column as a real array', async () => {
    const created = await repository.create({
      userId: ownerId,
      seriesId,
      description: 'Book one',
      tags: ['sci-fi', 'epic'],
    });

    const reloaded = await repository.findById(created.id);

    assert.ok(Array.isArray(reloaded?.tags));
    assert.deepEqual(reloaded?.tags, ['sci-fi', 'epic']);
    assert.equal(reloaded?.seriesId, seriesId);
  });

  test('stores a standalone book with a null seriesId', async () => {
    const created = await repository.create({
      userId: ownerId,
      seriesId: null,
      description: 'Standalone',
      tags: [],
    });

    assert.equal(created.seriesId, null);
    assert.equal((await repository.findById(created.id))?.seriesId, null);
  });

  test('tags survive multi-byte characters, thanks to utf8mb4', async () => {
    const created = await repository.create({
      userId: ownerId,
      seriesId: null,
      description: 'Эпопея 📚',
      tags: ['фантастика', '📚'],
    });

    const reloaded = await repository.findById(created.id);

    assert.equal(reloaded?.description, 'Эпопея 📚');
    assert.deepEqual(reloaded?.tags, ['фантастика', '📚']);
  });

  test('a create against an unknown user surfaces as NotFoundError, not a raw FK error', async () => {
    await assert.rejects(
      repository.create({
        userId: ownerId + 10_000,
        seriesId: null,
        description: 'Orphan',
        tags: [],
      }),
      (error: unknown) =>
        error instanceof NotFoundError &&
        /User \d+ not found/.test(error.message)
    );
  });

  // The two foreign keys are only distinguishable through MySQL's constraint
  // text, so this asserts the repository blames the right one — a "User not
  // found" here would send the caller hunting for a user that exists.
  test('a create against an unknown series blames the series, not the user', async () => {
    await assert.rejects(
      repository.create({
        userId: ownerId,
        seriesId: seriesId + 10_000,
        description: 'Orphan',
        tags: [],
      }),
      (error: unknown) =>
        error instanceof NotFoundError &&
        /Series \d+ not found/.test(error.message)
    );
  });

  test('an update to an unknown series is a NotFoundError on the series', async () => {
    const created = await repository.create({
      userId: ownerId,
      seriesId: null,
      description: 'Standalone',
      tags: [],
    });

    await assert.rejects(
      repository.update(created.id, { seriesId: seriesId + 10_000 }),
      (error: unknown) =>
        error instanceof NotFoundError &&
        /Series \d+ not found/.test(error.message)
    );
  });

  test('the tag filter matches through JSON_CONTAINS, not a substring', async () => {
    await repository.create({
      userId: ownerId,
      seriesId: null,
      description: 'Tagged epic',
      tags: ['epic'],
    });
    await repository.create({
      userId: ownerId,
      seriesId: null,
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
      seriesId: null,
      description: 'Contains a 100% real percent sign',
      tags: [],
    });
    await repository.create({
      userId: ownerId,
      seriesId: null,
      description: 'No metacharacter here',
      tags: [],
    });

    const matches = await repository.list({ limit: 20, offset: 0, q: '%' });

    assert.equal(matches.total, 1);
    assert.match(matches.items[0]?.description ?? '', /100% real/);
  });

  test('the series filter and paging envelope agree on the total', async () => {
    for (const description of ['One', 'Two', 'Three']) {
      await repository.create({
        userId: ownerId,
        seriesId,
        description,
        tags: [],
      });
    }
    await repository.create({
      userId: ownerId,
      seriesId: null,
      description: 'Standalone',
      tags: [],
    });

    const page = await repository.list({ limit: 2, offset: 0, seriesId });

    assert.equal(page.total, 3);
    assert.equal(page.items.length, 2);
  });

  test('an update replaces the whole tag array and leaves the owner alone', async () => {
    const created = await repository.create({
      userId: ownerId,
      seriesId,
      description: 'Original',
      tags: ['sci-fi', 'epic'],
    });

    const updated = await repository.update(created.id, { tags: ['drama'] });

    assert.deepEqual(updated?.tags, ['drama']);
    assert.equal(updated?.userId, ownerId);
    assert.equal(updated?.seriesId, seriesId);
    assert.equal(updated?.description, 'Original');
  });

  test('an update omitting tags and seriesId leaves both untouched', async () => {
    const created = await repository.create({
      userId: ownerId,
      seriesId,
      description: 'Original',
      tags: ['sci-fi'],
    });

    const updated = await repository.update(created.id, {
      description: 'Rewritten',
    });

    assert.equal(updated?.description, 'Rewritten');
    assert.deepEqual(updated?.tags, ['sci-fi']);
    assert.equal(updated?.seriesId, seriesId);
  });

  test('an explicit null seriesId unlinks the book from its series', async () => {
    const created = await repository.create({
      userId: ownerId,
      seriesId,
      description: 'Leaving the series',
      tags: [],
    });

    const updated = await repository.update(created.id, { seriesId: null });

    assert.equal(updated?.seriesId, null);
  });

  test('deleting the user cascades to their books', async () => {
    await repository.create({
      userId: ownerId,
      seriesId: null,
      description: 'Doomed',
      tags: [],
    });

    await User.destroy({ where: { id: ownerId } });

    assert.equal(await Book.count(), 0);
  });

  test('deleting the series unlinks its books instead of destroying them', async () => {
    const created = await repository.create({
      userId: ownerId,
      seriesId,
      description: 'Survivor',
      tags: [],
    });

    await Series.destroy({ where: { id: seriesId } });

    const reloaded = await repository.findById(created.id);
    assert.equal(reloaded?.description, 'Survivor');
    assert.equal(reloaded?.seriesId, null);
  });

  test('both hasMany associations eager-load under the `books` alias', async () => {
    await repository.create({
      userId: ownerId,
      seriesId,
      description: 'A',
      tags: [],
    });
    await repository.create({
      userId: ownerId,
      seriesId: null,
      description: 'B',
      tags: [],
    });

    const loadedUser = await User.findByPk(ownerId, {
      include: { association: 'books' },
    });
    const loadedSeries = await Series.findByPk(seriesId, {
      include: { association: 'books' },
    });

    assert.equal(loadedUser?.books?.length, 2);
    assert.equal(loadedSeries?.books?.length, 1);
  });
});
