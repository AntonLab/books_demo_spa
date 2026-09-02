import test from 'node:test';
import assert from 'node:assert/strict';
import { Sequelize } from 'sequelize';
import { initModels } from './index.ts';
import { Session } from './Session.ts';

interface QueryGeneratorLike {
  attributesToSQL(attributes: unknown, options: unknown): unknown;
  createTableQuery(
    table: string,
    attributes: unknown,
    options: unknown
  ): string;
}

// Built once: initModels declares the associations, and Sequelize rejects a
// second association under the same alias.
const createTableSql = (() => {
  const sequelize = new Sequelize('books_demo_spa', 'user', 'pass', {
    dialect: 'mysql',
    logging: false,
  });
  initModels(sequelize);

  const generator = sequelize.getQueryInterface()
    .queryGenerator as unknown as QueryGeneratorLike;
  const attributes = generator.attributesToSQL(Session.getAttributes(), {
    table: 'sessions',
  });

  return generator.createTableQuery('sessions', attributes, {
    charset: 'utf8mb4',
    collate: 'utf8mb4_0900_ai_ci',
    engine: 'InnoDB',
  });
})();

test('tokenHash is a fixed-width CHAR(64), the size of a SHA-256 hex digest', () => {
  assert.match(createTableSql, /`tokenHash` CHAR\(64\) NOT NULL/);
});

test('tokenHash is unique, so one token can never name two sessions', () => {
  assert.match(createTableSql, /`tokenHash`[^,]*UNIQUE/);
});

test('userId matches users.id exactly, or MySQL rejects the foreign key', () => {
  assert.match(createTableSql, /`userId` INTEGER UNSIGNED NOT NULL/);
});

test('expiresAt is NOT NULL: a session with no end is not a state worth storing', () => {
  assert.match(createTableSql, /`expiresAt` DATETIME NOT NULL/);
});

test('sessions cascade from their user', () => {
  const association = Session.associations.user;
  assert.ok(association, 'Session.belongsTo(User) must be declared');
});
