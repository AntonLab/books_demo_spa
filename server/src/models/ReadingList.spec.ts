import test from 'node:test';
import assert from 'node:assert/strict';
import { Sequelize } from 'sequelize';
import { initModels } from './index.ts';
import { ReadingList } from './ReadingList.ts';

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
  const attributes = generator.attributesToSQL(ReadingList.getAttributes(), {
    table: 'reading_lists',
  });

  return generator.createTableQuery('reading_lists', attributes, {
    charset: 'utf8mb4',
    collate: 'utf8mb4_0900_ai_ci',
    engine: 'InnoDB',
  });
})();

test('the owner is a NOT NULL INTEGER UNSIGNED that cascades with the account', () => {
  assert.match(createTableSql, /`userId` INTEGER UNSIGNED NOT NULL/);
  assert.match(
    createTableSql,
    /FOREIGN KEY \(`userId`\) REFERENCES `users` \(`id`\) ON DELETE CASCADE ON UPDATE CASCADE/
  );
});

test('title is VARCHAR(200) NOT NULL, description TEXT NOT NULL, tags JSON NOT NULL', () => {
  assert.match(createTableSql, /`title` VARCHAR\(200\) NOT NULL/);
  assert.match(createTableSql, /`description` TEXT NOT NULL/);
  assert.match(createTableSql, /`tags` JSON NOT NULL/);
});

test('both timestamps are NOT NULL with millisecond precision', () => {
  assert.match(createTableSql, /`createdAt` DATETIME\(3\) NOT NULL/);
  assert.match(createTableSql, /`updatedAt` DATETIME\(3\) NOT NULL/);
});

test('an owner reads its lists newest change first through one index', () => {
  assert.deepEqual(
    ReadingList.options.indexes?.map((index) => [index.name, index.fields]),
    [['reading_lists_user_id_updated_at', ['userId', 'updatedAt']]]
  );
});
