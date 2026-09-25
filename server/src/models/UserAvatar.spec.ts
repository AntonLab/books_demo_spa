import test from 'node:test';
import assert from 'node:assert/strict';
import { Sequelize } from 'sequelize';
import { initModels } from './index.ts';
import { UserAvatar } from './UserAvatar.ts';

// Sequelize's query generator is not part of the public typings — the same
// structural cast models/Like.spec.ts uses.
interface QueryGeneratorLike {
  attributesToSQL(attributes: unknown, options: unknown): unknown;
  createTableQuery(
    table: string,
    attributes: unknown,
    options: unknown
  ): string;
}

// No real connection: this only inspects the SQL Sequelize would send.
const createTableSql = (() => {
  const sequelize = new Sequelize('books_demo_spa', 'user', 'pass', {
    dialect: 'mysql',
    logging: false,
  });
  initModels(sequelize);

  const generator = sequelize.getQueryInterface()
    .queryGenerator as unknown as QueryGeneratorLike;
  const attributes = generator.attributesToSQL(UserAvatar.getAttributes(), {
    table: 'user_avatars',
  });
  return generator.createTableQuery('user_avatars', attributes, {
    charset: 'utf8mb4',
    collate: 'utf8mb4_0900_ai_ci',
    engine: 'InnoDB',
  });
})();

test('userId is the primary key, matching users.id (INTEGER UNSIGNED)', () => {
  assert.match(createTableSql, /`userId` INTEGER UNSIGNED/);
  assert.match(createTableSql, /PRIMARY KEY/);
});

test('data is a MEDIUMBLOB, never null', () => {
  assert.match(createTableSql, /`data` MEDIUMBLOB NOT NULL/);
});

test('updatedAt carries millisecond precision; there is no createdAt or content-type column', () => {
  assert.match(createTableSql, /`updatedAt` DATETIME\(3\) NOT NULL/);
  assert.doesNotMatch(createTableSql, /createdAt/);
  assert.doesNotMatch(createTableSql, /contentType/i);
});

// The cascade is the one mechanism this table exists to deliver:
// deleting a User must take its Avatar with it, with no application code.
test('userId cascades to users.id — deleting a User removes its Avatar', () => {
  assert.match(
    createTableSql,
    /FOREIGN KEY \(`userId`\) REFERENCES `users` \(`id`\) ON DELETE CASCADE ON UPDATE CASCADE/
  );
});
