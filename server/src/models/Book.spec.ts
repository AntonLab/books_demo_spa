import test from 'node:test';
import assert from 'node:assert/strict';
import { Sequelize } from 'sequelize';
import { initModels } from './index.ts';
import { Book, toPublicBook } from './Book.ts';

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

// Built once rather than per test: initModels declares the associations, and
// Sequelize rejects a second association under the same alias.
const createTableSql = (() => {
  const sequelize = new Sequelize('books_demo_spa', 'user', 'pass', {
    dialect: 'mysql',
    logging: false,
  });
  initModels(sequelize);

  const generator = sequelize.getQueryInterface()
    .queryGenerator as unknown as QueryGeneratorLike;
  const attributes = generator.attributesToSQL(Book.getAttributes(), {
    table: 'books',
  });

  return generator.createTableQuery('books', attributes, {
    charset: 'utf8mb4',
    collate: 'utf8mb4_0900_ai_ci',
    engine: 'InnoDB',
  });
})();

test('tags is a JSON column, since MySQL has no array type', () => {
  assert.match(createTableSql, /`tags` JSON NOT NULL/);
});

test('tags carries no DDL default — MySQL forbids one on a JSON column', () => {
  assert.doesNotMatch(createTableSql, /`tags` JSON[^,]*DEFAULT/);
});

test('books carries no owner column — its Co-authors live in book_authors', () => {
  assert.doesNotMatch(createTableSql, /`userId`/);
  assert.match(createTableSql, /`id` INTEGER UNSIGNED auto_increment/);
});

test('seriesId is nullable — a book need not belong to a series', () => {
  assert.match(createTableSql, /`seriesId` INTEGER UNSIGNED(?! NOT NULL)/);
  assert.doesNotMatch(createTableSql, /`seriesId` INTEGER UNSIGNED NOT NULL/);
});

test('Series.hasMany(Book) unlinks rather than deletes, since seriesId is optional', () => {
  assert.match(
    createTableSql,
    /FOREIGN KEY \(`seriesId`\) REFERENCES `series` \(`id`\) ON DELETE SET NULL ON UPDATE CASCADE/
  );
});

test('description is TEXT and the timestamps are NOT NULL', () => {
  assert.match(createTableSql, /`description` TEXT NOT NULL/);
  assert.match(createTableSql, /`createdAt` DATETIME NOT NULL/);
  assert.match(createTableSql, /`updatedAt` DATETIME NOT NULL/);
});

test('the table is InnoDB with the utf8mb4 default collation', () => {
  assert.match(
    createTableSql,
    /ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE utf8mb4_0900_ai_ci/
  );
});

test('seriesPosition is a nullable unsigned integer — a standalone book has no place in a series', () => {
  assert.match(createTableSql, /`seriesPosition` INTEGER UNSIGNED,/);
});

test('the series filter is indexed alongside the Series order, so it needs no filesort', () => {
  assert.deepEqual(
    Book.options.indexes?.map((index) => index.fields),
    [['seriesId', 'seriesPosition']]
  );
});

test('toPublicBook leaves the Series order out — it orders a list and is never shown', () => {
  const book = Book.build({
    id: 1,
    seriesId: 3,
    seriesPosition: 2,
    title: 'Test Book',
    description: 'A novel',
    tags: [],
  });

  assert.ok(!('seriesPosition' in toPublicBook(book, [], null)));
});

test('Book belongs to a Series and reaches its Co-authors through credits', () => {
  assert.equal(Book.associations.series?.associationType, 'BelongsTo');
  assert.equal(Book.associations.series?.target.name, 'Series');
  assert.equal(Book.associations.credits?.associationType, 'HasMany');
  assert.equal(Book.associations.credits?.target.name, 'BookAuthor');
  assert.equal(Book.associations.user, undefined);
});

test('toPublicBook copies the tag array rather than aliasing the model', () => {
  const book = Book.build({
    id: 1,
    seriesId: 3,
    title: 'Test Book',
    description: 'A novel',
    tags: ['sci-fi'],
  });

  const output = toPublicBook(book, [], null);
  output.tags.push('mutated');

  assert.deepEqual(book.tags, ['sci-fi']);
});

test('toPublicBook parses a JSON string, should a driver return one raw', () => {
  const book = Book.build({
    id: 1,
    title: 'Test Book',
    description: 'A novel',
    tags: ['sci-fi'],
  });
  // A raw string is the shape a non-parsing driver would hand back; without
  // normalisation it would be spread character by character.
  book.setDataValue('tags', '["sci-fi","epic"]' as unknown as string[]);

  assert.deepEqual(toPublicBook(book, [], null).tags, ['sci-fi', 'epic']);
});

test('toPublicBook reports a standalone book as seriesId: null, never undefined', () => {
  const book = Book.build({
    id: 1,
    title: 'Test Book',
    description: 'Standalone',
    tags: [],
  });

  const output = toPublicBook(book, [], null);

  assert.equal(output.seriesId, null);
  assert.ok('seriesId' in output);
});
