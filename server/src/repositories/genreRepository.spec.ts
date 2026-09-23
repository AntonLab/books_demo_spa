process.env.NODE_ENV ??= 'test';

import { after, before, beforeEach, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import type { Sequelize } from 'sequelize';
import { createSequelize } from '../db/sequelize.ts';
import { ensureDatabase } from '../db/ensureDatabase.ts';
import { parseConfig } from '../db/config.ts';
import { skipWithoutMysql } from '../db/mysqlProbe.testkit.ts';
import { Book, Genre, initModels, Series } from '../models/index.ts';
import { createSequelizeBookRepository } from './bookRepository.ts';
import {
  assertGenreExists,
  createSequelizeGenreRepository,
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
    await Genre.destroy({ where: {}, truncate: false });
  });

  // A4, and the one rule here that only MySQL can prove: the deletion and the
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

  // --- The contract the route specs' fake is held to, run here for real. ---

  genreRepositoryContract(async () => ({ repository }));
});
