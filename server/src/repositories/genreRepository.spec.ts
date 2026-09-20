process.env.NODE_ENV ??= 'test';

import { after, before, beforeEach, describe } from 'node:test';
import type { Sequelize } from 'sequelize';
import { createSequelize } from '../db/sequelize.ts';
import { ensureDatabase } from '../db/ensureDatabase.ts';
import { parseConfig } from '../db/config.ts';
import { skipWithoutMysql } from '../db/mysqlProbe.testkit.ts';
import { Genre, initModels } from '../models/index.ts';
import { createSequelizeGenreRepository } from './genreRepository.ts';
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
    await Genre.destroy({ where: {}, truncate: false });
  });

  // --- The contract the route specs' fake is held to, run here for real. ---

  genreRepositoryContract(async () => ({ repository }));
});
