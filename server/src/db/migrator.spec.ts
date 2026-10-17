process.env.NODE_ENV ??= 'test';

import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import type { Sequelize } from 'sequelize';
import { createSequelize } from './sequelize.ts';
import { ensureDatabase } from './ensureDatabase.ts';
import { parseConfig } from './config.ts';
import { skipWithoutMysql } from './mysqlProbe.testkit.ts';
import { assertNoPendingMigrations, createMigrator } from './migrator.ts';

// Its own schema: node:test runs spec files in parallel processes.
const BASE = process.env.TEST_DB_NAME ?? 'books_demo_spa_test';

const skip = await skipWithoutMysql();

describe('assertNoPendingMigrations', { skip }, () => {
  let sequelize: Sequelize;

  before(async () => {
    const db = parseConfig({
      ...process.env,
      NODE_ENV: 'test',
      DB_NAME: `${BASE}_migrator`,
    }).db;
    await ensureDatabase(db);
    sequelize = createSequelize(db);
    await sequelize.getQueryInterface().dropAllTables();
  });

  after(async () => {
    await sequelize.close();
  });

  // Order matters: the second test needs the empty database the first leaves.
  test('throws and names the unapplied migration', async () => {
    await assert.rejects(assertNoPendingMigrations(createMigrator(sequelize)), {
      message:
        'Pending migrations: 0001-baseline.ts. Run npm run migrate -w server',
    });
  });

  test('resolves once up() has run', async () => {
    await createMigrator(sequelize).up();
    await assert.doesNotReject(
      assertNoPendingMigrations(createMigrator(sequelize))
    );
  });
});
