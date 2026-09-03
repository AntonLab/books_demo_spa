process.env.NODE_ENV ??= 'test';

import { after, before, beforeEach, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import mysql from 'mysql2/promise';
import type { Sequelize } from 'sequelize';
import { createSequelize } from '../db/sequelize.ts';
import { ensureDatabase } from '../db/ensureDatabase.ts';
import { parseConfig } from '../db/config.ts';
import { initModels, Series, User } from '../models/index.ts';
import { NotFoundError } from '../types/errors.ts';
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
    // series first: the foreign key forbids clearing users out from under it.
    await Series.destroy({ where: {}, truncate: false });
    await User.destroy({ where: {}, truncate: false });
    ownerId = (await User.create(owner)).id;
  });

  test('round-trips tags through the JSON column as a real array', async () => {
    const created = await repository.create({
      userId: ownerId,
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
      description: 'No tags',
      tags: [],
    });

    assert.deepEqual((await repository.findById(created.id))?.tags, []);
  });

  test('tags survive multi-byte characters, thanks to utf8mb4', async () => {
    const created = await repository.create({
      userId: ownerId,
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
      description: 'Tagged epic',
      tags: ['epic'],
    });
    await repository.create({
      userId: ownerId,
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
      description: 'Contains a 100% real percent sign',
      tags: [],
    });
    await repository.create({
      userId: ownerId,
      description: 'No metacharacter here',
      tags: [],
    });

    const matches = await repository.list({ limit: 20, offset: 0, q: '%' });

    assert.equal(matches.total, 1);
    assert.match(matches.items[0]?.description ?? '', /100% real/);
  });

  test('the owner filter and paging envelope agree on the total', async () => {
    const otherId = (
      await User.create({
        ...owner,
        login: 'OtherOwner',
        email: 'other@example.com',
      })
    ).id;

    for (const description of ['One', 'Two', 'Three']) {
      await repository.create({ userId: ownerId, description, tags: [] });
    }
    await repository.create({
      userId: otherId,
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

  test('an update replaces the whole tag array and leaves the owner alone', async () => {
    const created = await repository.create({
      userId: ownerId,
      description: 'Original',
      tags: ['sci-fi', 'epic'],
    });

    const updated = await repository.update(created.id, { tags: ['drama'] });

    assert.deepEqual(updated?.tags, ['drama']);
    assert.equal(updated?.userId, ownerId);
    assert.equal(updated?.description, 'Original');
  });

  test('an update omitting tags leaves the stored ones untouched', async () => {
    const created = await repository.create({
      userId: ownerId,
      description: 'Original',
      tags: ['sci-fi'],
    });

    const updated = await repository.update(created.id, {
      description: 'Rewritten',
    });

    assert.equal(updated?.description, 'Rewritten');
    assert.deepEqual(updated?.tags, ['sci-fi']);
  });

  test('deleting the user cascades to their series', async () => {
    await repository.create({
      userId: ownerId,
      description: 'Doomed',
      tags: [],
    });

    await User.destroy({ where: { id: ownerId } });

    assert.equal(await Series.count(), 0);
  });

  test('User.hasMany(Series) eager-loads under the `series` alias', async () => {
    await repository.create({ userId: ownerId, description: 'A', tags: [] });
    await repository.create({ userId: ownerId, description: 'B', tags: [] });

    const loaded = await User.findByPk(ownerId, {
      include: { association: 'series' },
    });

    assert.equal(loaded?.series?.length, 2);
  });
});
