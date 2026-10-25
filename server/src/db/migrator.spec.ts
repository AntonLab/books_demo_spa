process.env.NODE_ENV ??= 'test';

import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import type { QueryInterface, Sequelize } from 'sequelize';
import type { Umzug } from 'umzug';
import { createSequelize } from './sequelize.ts';
import { ensureDatabase } from './ensureDatabase.ts';
import { skipWithoutMysql } from './mysqlProbe.testkit.ts';
import { testDbConfig } from './testDb.testkit.ts';
import { assertNoPendingMigrations, createMigrator } from './migrator.ts';

const skip = await skipWithoutMysql();

describe('assertNoPendingMigrations message', () => {
  test('joins several pending names with a comma', async () => {
    const stub = {
      pending: async () => [{ name: 'a.ts' }, { name: 'b.ts' }],
    } as unknown as Umzug<QueryInterface>;
    await assert.rejects(assertNoPendingMigrations(stub), {
      message: 'Pending migrations: a.ts, b.ts. Run npm run migrate -w server',
    });
  });
});

describe('assertNoPendingMigrations', { skip }, () => {
  let sequelize: Sequelize;

  before(async () => {
    const db = testDbConfig('migrator');
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
        'Pending migrations: 0001-baseline.ts, 0002-illustrations.ts, 0003-xor-checks.ts, 0004-illustration-dimensions.ts. Run npm run migrate -w server',
    });
  });

  test('resolves once up() has run', async () => {
    await createMigrator(sequelize).up();
    await assert.doesNotReject(
      assertNoPendingMigrations(createMigrator(sequelize))
    );
  });
});
