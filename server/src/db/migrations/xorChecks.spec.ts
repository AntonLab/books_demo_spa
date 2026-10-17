process.env.NODE_ENV ??= 'test';

import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import type { Sequelize } from 'sequelize';
import { createSequelize } from '../sequelize.ts';
import { ensureDatabase } from '../ensureDatabase.ts';
import { skipWithoutMysql } from '../mysqlProbe.testkit.ts';
import { testDbConfig } from '../testDb.testkit.ts';
import { createMigrator } from '../migrator.ts';
import { up } from './0003-xor-checks.ts';

const skip = await skipWithoutMysql();

// ER_CHECK_CONSTRAINT_VIOLATED
const CHECK_VIOLATED = /Check constraint .* is violated/;

// Raw SQL, because the model validators already refuse these rows before the
// database sees them. Foreign keys are off on one connection so the ids need
// no parent rows: only the CHECK is in question.
describe(
  'likes and favorites XOR CHECK on the migrated schema',
  { skip },
  () => {
    let sequelize: Sequelize;

    before(async () => {
      const db = testDbConfig('xor_checks');
      await ensureDatabase(db);
      sequelize = createSequelize(db);
      await sequelize.getQueryInterface().dropAllTables();
      await createMigrator(sequelize).up();
    });

    after(async () => {
      await sequelize.close();
    });

    // Rolled back, so one case never leaves a row behind for the next.
    async function insert(sql: string): Promise<void> {
      const transaction = await sequelize.transaction();
      try {
        await sequelize.query('SET FOREIGN_KEY_CHECKS = 0', { transaction });
        await sequelize.query(sql, { transaction });
      } finally {
        await transaction.rollback();
      }
    }

    const likes = (bookId: string, commentId: string) =>
      `INSERT INTO likes (userId, bookId, commentId, isLike, createdAt) VALUES (1, ${bookId}, ${commentId}, 1, NOW())`;
    const favorites = (bookId: string, seriesId: string) =>
      `INSERT INTO favorites (userId, bookId, seriesId, createdAt) VALUES (1, ${bookId}, ${seriesId}, NOW())`;

    test('likes accept exactly one target', async () => {
      await insert(likes('1', 'NULL'));
      await insert(likes('NULL', '1'));
    });

    test('likes refuse no target and both targets', async () => {
      await assert.rejects(insert(likes('NULL', 'NULL')), CHECK_VIOLATED);
      await assert.rejects(insert(likes('1', '1')), CHECK_VIOLATED);
    });

    test('favorites accept exactly one target', async () => {
      await insert(favorites('1', 'NULL'));
      await insert(favorites('NULL', '1'));
    });

    test('favorites refuse no target and both targets', async () => {
      await assert.rejects(insert(favorites('NULL', 'NULL')), CHECK_VIOLATED);
      await assert.rejects(insert(favorites('1', '1')), CHECK_VIOLATED);
    });
  }
);

// DDL does not roll back, so a row that breaks the XOR must fail the migration
// at the CHECK, after the FKs are back, and a rerun must still start.
describe('migration 0003 on a row that breaks the XOR', { skip }, () => {
  let sequelize: Sequelize;

  before(async () => {
    const db = testDbConfig('xor_checks_violation');
    await ensureDatabase(db);
    sequelize = createSequelize(db);
    await sequelize.getQueryInterface().dropAllTables();
    await createMigrator(sequelize).up({ to: '0002-illustrations.ts' });
    await sequelize.query('SET FOREIGN_KEY_CHECKS = 0');
    await sequelize.query(
      'INSERT INTO likes (userId, bookId, commentId, isLike, createdAt) VALUES (1, NULL, NULL, 1, NOW())'
    );
    await sequelize.query('SET FOREIGN_KEY_CHECKS = 1');
  });

  after(async () => {
    await sequelize.close();
  });

  test('fails on the CHECK and keeps the target foreign keys', async () => {
    const queryInterface = sequelize.getQueryInterface();
    await assert.rejects(up(queryInterface), CHECK_VIOLATED);
    await assert.rejects(up(queryInterface), CHECK_VIOLATED);

    const [rows] = await sequelize.query('SHOW CREATE TABLE likes');
    const ddl = String(Object.values(rows[0] ?? {})[1]);
    assert.match(ddl, /CONSTRAINT `likes_ibfk_2` FOREIGN KEY/);
    assert.match(ddl, /CONSTRAINT `likes_ibfk_3` FOREIGN KEY/);
  });
});
