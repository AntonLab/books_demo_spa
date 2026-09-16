import test from 'node:test';
import assert from 'node:assert/strict';
import { Sequelize } from 'sequelize';
import { initModels } from './index.ts';
import { BookCover } from './BookCover.ts';

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
  const attributes = generator.attributesToSQL(BookCover.getAttributes(), {
    table: 'book_covers',
  });
  return generator.createTableQuery('book_covers', attributes, {
    charset: 'utf8mb4',
    collate: 'utf8mb4_0900_ai_ci',
    engine: 'InnoDB',
  });
})();

test('bookId is the primary key, matching books.id (INTEGER UNSIGNED)', () => {
  assert.match(createTableSql, /`bookId` INTEGER UNSIGNED/);
  assert.match(createTableSql, /PRIMARY KEY/);
});

test('data is a MEDIUMBLOB, never null', () => {
  assert.match(createTableSql, /`data` MEDIUMBLOB NOT NULL/);
});

test('updatedAt carries millisecond precision; there is no createdAt or content-type column (S1)', () => {
  assert.match(createTableSql, /`updatedAt` DATETIME\(3\) NOT NULL/);
  assert.doesNotMatch(createTableSql, /createdAt/);
  assert.doesNotMatch(createTableSql, /contentType/i);
});
