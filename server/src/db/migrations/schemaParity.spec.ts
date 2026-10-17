process.env.NODE_ENV ??= 'test';

import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import type { Sequelize } from 'sequelize';
import { createSequelize } from '../sequelize.ts';
import { ensureDatabase } from '../ensureDatabase.ts';
import { skipWithoutMysql } from '../mysqlProbe.testkit.ts';
import { testDbConfig } from '../testDb.testkit.ts';
import { createMigrator } from '../migrator.ts';
import { initModels } from '../../models/index.ts';

interface Schema {
  tables: string[];
  ddl: Record<string, string>;
}

async function readSchema(sequelize: Sequelize): Promise<Schema> {
  const [rows] = await sequelize.query('SHOW TABLES');
  const tables = rows
    .map((row) => Object.values(row as Record<string, string>)[0] as string)
    // Case-insensitive: MySQL on Windows lowercases table names.
    .filter((table) => table.toLowerCase() !== 'sequelizemeta')
    .sort();
  const ddl: Record<string, string> = {};
  for (const table of tables) {
    const [create] = (await sequelize.query(
      `SHOW CREATE TABLE \`${table}\``
    )) as [Record<string, string>[], unknown];
    // CHECK lines are dropped: Sequelize 6 cannot declare them, so sync() emits
    // none. xorChecks.spec.ts covers the ones the migrations add.
    ddl[table] = (create[0]?.['Create Table'] ?? '')
      .replace(/ AUTO_INCREMENT=\d+/, '')
      .replace(/,\n {2}CONSTRAINT `[^`]+` CHECK .*(?=\n\))/, '');
  }
  return { tables, ddl };
}

const skip = await skipWithoutMysql();

describe('migrations vs sync()', { skip }, () => {
  let migratedSequelize: Sequelize;
  let synced: Schema;
  let migrated: Schema;

  before(async () => {
    const syncDb = testDbConfig('parity_sync');
    await ensureDatabase(syncDb);
    const syncSequelize = createSequelize(syncDb);
    initModels(syncSequelize);
    await syncSequelize.sync({ force: true });
    synced = await readSchema(syncSequelize);
    await syncSequelize.close();

    const migratedDb = testDbConfig('parity_migrated');
    await ensureDatabase(migratedDb);
    migratedSequelize = createSequelize(migratedDb);
    await migratedSequelize.getQueryInterface().dropAllTables();
    await createMigrator(migratedSequelize).up();
    migrated = await readSchema(migratedSequelize);
  });

  after(async () => {
    await migratedSequelize.close();
  });

  test('both schemas hold the same tables', () => {
    assert.deepEqual(migrated.tables, synced.tables);
    assert.ok(synced.tables.length >= 20);
  });

  test('each table has the same SHOW CREATE TABLE', () => {
    // Per table, so a failure names it.
    for (const table of synced.tables) {
      assert.equal(migrated.ddl[table], synced.ddl[table], table);
    }
  });

  test('up() is idempotent: a second run applies nothing', async () => {
    assert.deepEqual(await createMigrator(migratedSequelize).up(), []);
  });
});
