process.env.NODE_ENV ??= 'test';

import { after, before, beforeEach, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import mysql from 'mysql2/promise';
import type { Sequelize } from 'sequelize';
import { createSequelize } from '../db/sequelize.ts';
import { ensureDatabase } from '../db/ensureDatabase.ts';
import { parseConfig } from '../db/config.ts';
import { initModels } from '../models/index.ts';
import { Permission } from '../models/Permission.ts';
import { buildMatrixRows } from './matrix.ts';
import { loadMatrix, scopeFor, syncPermissions } from './permissionStore.ts';

// A schema of its own rather than the other suites': node:test runs spec files
// in parallel processes, and two suites calling sync({ force: true }) on one
// database would drop each other's tables mid-run.
const TEST_DB_NAME = `${process.env.TEST_DB_NAME ?? 'books_demo_spa_test'}_permissions`;

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

// Runs before the suite below, which is what makes it meaningful: it asserts
// what the store answers when nothing has synced it yet.
test('answers from the code-built matrix before any sync', () => {
  // createApp does not sync — only src/index.ts does — so a store that started
  // empty would deny every request in every route spec, and in any process
  // that mounts the app without a database behind it.
  assert.equal(scopeFor('guest', 'books', 'read'), 'any');
  assert.equal(scopeFor('author', 'books', 'create'), 'own');
  assert.equal(scopeFor('user', 'books', 'create'), 'none');
});

describe('permissionStore against real MySQL', { skip }, () => {
  let sequelize: Sequelize;

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

  // Each test seeds or reads the table on its own terms, so it starts from
  // empty rather than inheriting rows a previous test's syncPermissions call
  // left behind.
  //
  // The in-memory store is emptied too. It seeds itself from the same code
  // syncPermissions writes, so without this a scopeFor assertion below would
  // pass even if syncPermissions never reloaded the map from the table.
  beforeEach(async () => {
    await Permission.destroy({ where: {}, truncate: false });
    loadMatrix([]);
  });

  test('syncPermissions writes every row and scopeFor reads them back', async () => {
    await syncPermissions();

    assert.equal(await Permission.count(), buildMatrixRows().length);
    assert.equal(scopeFor('author', 'books', 'create'), 'own');
    assert.equal(scopeFor('guest', 'users', 'read'), 'none');
  });

  test('syncPermissions replaces the table wholesale', async () => {
    await Permission.create({
      role: 'guest',
      module: 'books',
      action: 'create',
      scope: 'any',
    });
    // A row for a module that no longer exists in the code would survive a
    // partial upsert; replacing wholesale is what keeps the table a mirror of
    // the definition rather than an accumulation of history.
    await syncPermissions();

    assert.equal(await Permission.count(), buildMatrixRows().length);
    assert.equal(scopeFor('guest', 'books', 'create'), 'none');
  });

  test('syncPermissions is idempotent', async () => {
    await syncPermissions();
    await syncPermissions();

    assert.equal(await Permission.count(), buildMatrixRows().length);
  });
});
