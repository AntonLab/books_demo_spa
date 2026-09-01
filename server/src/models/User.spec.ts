import test from 'node:test';
import assert from 'node:assert/strict';
import { Sequelize } from 'sequelize';
import { initUserModel, User } from './User.ts';

// Sequelize's query generator is not part of the public typings, so it is
// reached through a narrow structural cast rather than `any`.
interface QueryGeneratorLike {
  attributesToSQL(attributes: unknown, options: unknown): unknown;
  createTableQuery(
    table: string,
    attributes: unknown,
    options: unknown
  ): string;
}

function generateCreateTable(): string {
  const sequelize = new Sequelize('books_demo_spa', 'user', 'pass', {
    dialect: 'mysql',
    logging: false,
  });
  initUserModel(sequelize);

  const generator = sequelize.getQueryInterface()
    .queryGenerator as unknown as QueryGeneratorLike;
  const attributes = generator.attributesToSQL(User.getAttributes(), {
    table: 'users',
  });

  return generator.createTableQuery('users', attributes, {
    charset: 'utf8mb4',
    collate: 'utf8mb4_0900_ai_ci',
    engine: 'InnoDB',
  });
}

test('login is case-sensitive through an explicit column collation', () => {
  assert.match(
    generateCreateTable(),
    /`login` VARCHAR\(64\) COLLATE utf8mb4_0900_as_cs/
  );
});

test('email carries no column collation, inheriting the case-insensitive table default', () => {
  const sql = generateCreateTable();

  assert.match(sql, /`email` VARCHAR\(255\) NOT NULL UNIQUE/);
  assert.doesNotMatch(sql, /`email` VARCHAR\(255\) COLLATE/);
});

test('login and email are both unique', () => {
  const sql = generateCreateTable();

  assert.match(sql, /`login`[^,]*UNIQUE/);
  assert.match(sql, /`email`[^,]*UNIQUE/);
});

test('status is a MySQL ENUM defaulting to pending', () => {
  assert.match(
    generateCreateTable(),
    /`status` ENUM\('active', 'blocked', 'pending'\) NOT NULL DEFAULT 'pending'/
  );
});

test('the table is InnoDB with the utf8mb4 default collation', () => {
  assert.match(
    generateCreateTable(),
    /ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE utf8mb4_0900_ai_ci/
  );
});

test('timestamps exist and the primary key is an unsigned auto-increment integer', () => {
  const sql = generateCreateTable();

  assert.match(sql, /`createdAt` DATETIME NOT NULL/);
  assert.match(sql, /`updatedAt` DATETIME NOT NULL/);
  assert.match(sql, /`id` INTEGER UNSIGNED auto_increment/);
});
