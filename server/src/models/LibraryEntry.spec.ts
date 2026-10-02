import test from 'node:test';
import assert from 'node:assert/strict';
import { Sequelize } from 'sequelize';
import { Book } from './Book.ts';
import { initModels } from './index.ts';
import { LibraryEntry, toPublicLibraryEntry } from './LibraryEntry.ts';
import { User } from './User.ts';

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
  const attributes = generator.attributesToSQL(LibraryEntry.getAttributes(), {
    table: 'library_entries',
  });

  return generator.createTableQuery('library_entries', attributes, {
    charset: 'utf8mb4',
    collate: 'utf8mb4_0900_ai_ci',
    engine: 'InnoDB',
  });
})();

test('table is library_entries; user and book are NOT NULL INTEGER UNSIGNED', () => {
  assert.equal(LibraryEntry.getTableName(), 'library_entries');
  assert.match(createTableSql, /`userId` INTEGER UNSIGNED NOT NULL/);
  assert.match(createTableSql, /`bookId` INTEGER UNSIGNED NOT NULL/);
});

test('status is a NOT NULL ENUM of the four Reading statuses', () => {
  assert.match(
    createTableSql,
    /`status` ENUM\('reading', 'plan_to_read', 'read', 'not_interested'\) NOT NULL/
  );
});

test('createdAt and updatedAt are NOT NULL with millisecond precision', () => {
  assert.match(createTableSql, /`createdAt` DATETIME\(3\) NOT NULL/);
  assert.match(createTableSql, /`updatedAt` DATETIME\(3\) NOT NULL/);
});

test('both foreign keys cascade', () => {
  assert.match(
    createTableSql,
    /FOREIGN KEY \(`userId`\) REFERENCES `users` \(`id`\) ON DELETE CASCADE ON UPDATE CASCADE/
  );
  assert.match(
    createTableSql,
    /FOREIGN KEY \(`bookId`\) REFERENCES `books` \(`id`\) ON DELETE CASCADE ON UPDATE CASCADE/
  );
});

test('a unique (userId, bookId) pair, plus the counts and list indexes', () => {
  assert.deepEqual(
    LibraryEntry.options.indexes?.map((index) => [
      index.fields,
      index.unique === true,
    ]),
    [
      [['bookId', 'status'], false],
      [['userId', 'bookId'], true],
      [['userId', 'status', 'updatedAt'], false],
    ]
  );
});

test('LibraryEntry belongs to a User and a Book, and each has many', () => {
  assert.equal(LibraryEntry.associations.user?.associationType, 'BelongsTo');
  assert.equal(LibraryEntry.associations.book?.associationType, 'BelongsTo');
  assert.equal(User.associations.libraryEntries?.target.name, 'LibraryEntry');
  assert.equal(Book.associations.libraryEntries?.target.name, 'LibraryEntry');
});

test('toPublicLibraryEntry keeps bookId, status and updatedAt only', () => {
  const updatedAt = new Date('2026-01-02T03:04:05Z');
  const entry = LibraryEntry.build({
    id: 1,
    userId: 2,
    bookId: 3,
    status: 'read',
    createdAt: updatedAt,
    updatedAt,
  });
  assert.deepEqual(toPublicLibraryEntry(entry), {
    bookId: 3,
    status: 'read',
    updatedAt,
  });
});
