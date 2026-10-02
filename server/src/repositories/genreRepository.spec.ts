process.env.NODE_ENV ??= 'test';

import { after, before, beforeEach, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ForeignKeyConstraintError,
  UniqueConstraintError,
  type Sequelize,
} from 'sequelize';
import { createSequelize } from '../db/sequelize.ts';
import { ensureDatabase } from '../db/ensureDatabase.ts';
import { parseConfig } from '../db/config.ts';
import { skipWithoutMysql } from '../db/mysqlProbe.testkit.ts';
import { initModels } from '../models/index.ts';
import { Book } from '../models/Book.ts';
import { destroyAllGenres, Genre } from '../models/Genre.ts';
import { Series } from '../models/Series.ts';
import { createSequelizeBookRepository } from './bookRepository.ts';
import {
  assertGenreExists,
  createSequelizeGenreRepository,
  loadGenres,
} from './genreRepository.ts';
import { genreRepositoryContract } from './genreRepository.contract.testkit.ts';

// A schema of its own rather than another suite's: node:test runs spec files in
// parallel processes, and two suites calling sync({ force: true }) on one
// database would drop each other's tables mid-run.
const TEST_DB_NAME = `${process.env.TEST_DB_NAME ?? 'books_demo_spa_test'}_genres`;

function testDbConfig() {
  const config = parseConfig({
    ...process.env,
    NODE_ENV: 'test',
    DB_NAME: TEST_DB_NAME,
  });
  return config.db;
}

const skip = await skipWithoutMysql();

// Every rule a Genre has — case-insensitive uniqueness, the alphabetical
// order, what a missing row answers — is in the contract, because the fake has
// to match all three. So this suite is the contract run for real, plus the
// foreign key, which only MySQL has.
describe('genreRepository against real MySQL', { skip }, () => {
  let sequelize: Sequelize;
  const repository = createSequelizeGenreRepository();

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
    await Book.destroy({ where: {}, truncate: false });
    await Series.destroy({ where: {}, truncate: false });
    await destroyAllGenres();
  });

  test('sibling names are unique, case-insensitively, per parent — enforced by the database', async () => {
    const fantasy = await Genre.create({ name: 'Fantasy' });
    const horror = await Genre.create({ name: 'Horror' });
    await Genre.create({ name: 'Urban', parentId: fantasy.id });

    await assert.rejects(
      Genre.create({ name: 'urban', parentId: fantasy.id }),
      UniqueConstraintError
    );
    // Another parent, and the top level, are other scopes.
    await Genre.create({ name: 'Urban', parentId: horror.id });
    await Genre.create({ name: 'Urban' });
    await assert.rejects(
      Genre.create({ name: 'URBAN' }),
      UniqueConstraintError
    );
    await assert.rejects(
      Genre.create({ name: 'fantasy' }),
      UniqueConstraintError
    );
  });

  test('the database refuses to delete a Genre that still has a Subgenre', async () => {
    const parent = await Genre.create({ name: 'Fantasy' });
    await Genre.create({ name: 'Urban', parentId: parent.id });
    await assert.rejects(
      Genre.destroy({ where: { id: parent.id } }),
      ForeignKeyConstraintError
    );
  });

  test('loadGenres embeds the parent of a Subgenre, and null for a top-level Genre', async () => {
    const parent = await Genre.create({ name: 'Fantasy' });
    const child = await Genre.create({ name: 'Urban', parentId: parent.id });
    const map = await loadGenres([parent.id, child.id, null]);
    assert.deepEqual(map.get(parent.id), {
      id: parent.id,
      name: 'Fantasy',
      parent: null,
    });
    assert.deepEqual(map.get(child.id)?.parent, {
      id: parent.id,
      name: 'Fantasy',
    });
  });

  // The one rule here that only MySQL can prove: the deletion and the
  // unlinking are the same statement, so no Book or Series is ever left
  // pointing at a Genre that is gone.
  test('a deleted Genre leaves its books and series without one, in the same statement', async () => {
    const genre = await Genre.create({ name: 'Gothic' });
    const book = await Book.create({
      title: 'In Gothic',
      description: 'A',
      tags: [],
      genreId: genre.id,
    });
    const series = await Series.create({
      title: 'Also Gothic',
      description: 'B',
      tags: [],
      genreId: genre.id,
    });

    assert.equal(await repository.remove(genre.id), true);

    await book.reload();
    await series.reload();
    assert.equal(book.genreId, null);
    assert.equal(series.genreId, null);
    // And through the response shape a client actually reads.
    assert.equal(
      (await createSequelizeBookRepository().findById(book.id))?.genre,
      null
    );
  });

  // Without the lock a Genre deleted between the check and the write trips the
  // books/series foreign key, which reaches the client as an unmapped 500.
  test('a Genre checked inside a transaction cannot be deleted until it ends', async () => {
    const genre = await Genre.create({ name: 'Gothic' });

    await sequelize.transaction(async (holder) => {
      await assertGenreExists(genre.id, holder);

      await sequelize.transaction(async (deleter) => {
        await sequelize.query('SET SESSION innodb_lock_wait_timeout = 1', {
          transaction: deleter,
        });
        try {
          await assert.rejects(
            Genre.destroy({ where: { id: genre.id }, transaction: deleter }),
            /Lock wait timeout/
          );
        } finally {
          // The session outlives the transaction in the pool.
          await sequelize.query(
            'SET SESSION innodb_lock_wait_timeout = DEFAULT',
            {
              transaction: deleter,
            }
          );
        }
      });
    });
  });

  test('nonEmpty lists only genres holding a book in progress or complete; a draft reveals none', async () => {
    const ongoing = await Genre.create({ name: 'A Ongoing' });
    const complete = await Genre.create({ name: 'B Complete' });
    const draftOnly = await Genre.create({ name: 'C Draft only' });
    await Genre.create({ name: 'D Bare' });
    for (const [genre, status] of [
      [ongoing, 'in_progress'],
      [complete, 'complete'],
      [draftOnly, 'draft'],
    ] as const) {
      await Book.create({
        title: genre.name,
        description: 'x',
        tags: [],
        genreId: genre.id,
        status,
      });
    }

    assert.deepEqual(
      (await repository.list({ nonEmpty: true })).map((genre) => genre.name),
      ['A Ongoing', 'B Complete']
    );
    assert.equal((await repository.list()).length, 4);
  });

  // --- The contract the route specs' fake is held to, run here for real. ---

  genreRepositoryContract(async () => ({ repository }));
});
