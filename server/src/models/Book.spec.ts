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

test('userId matches users.id exactly, or MySQL rejects the foreign key', () => {
  assert.match(createTableSql, /`userId` INTEGER UNSIGNED NOT NULL/);
  assert.match(createTableSql, /`id` INTEGER UNSIGNED auto_increment/);
});

test('seriesId is nullable — a book need not belong to a series', () => {
  assert.match(createTableSql, /`seriesId` INTEGER UNSIGNED(?! NOT NULL)/);
  assert.doesNotMatch(createTableSql, /`seriesId` INTEGER UNSIGNED NOT NULL/);
});

test('User.hasMany(Book) emits a cascading foreign key to users', () => {
  assert.match(
    createTableSql,
    /FOREIGN KEY \(`userId`\) REFERENCES `users` \(`id`\) ON DELETE CASCADE ON UPDATE CASCADE/
  );
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

test('both owner filters are indexed alongside id, so neither needs a filesort', () => {
  assert.deepEqual(
    Book.options.indexes?.map((index) => index.fields),
    [
      ['userId', 'id'],
      ['seriesId', 'id'],
    ]
  );
});

test('Book belongs to both User and Series under distinct aliases', () => {
  assert.equal(Book.associations.user?.associationType, 'BelongsTo');
  assert.equal(Book.associations.user?.target.name, 'User');
  assert.equal(Book.associations.series?.associationType, 'BelongsTo');
  assert.equal(Book.associations.series?.target.name, 'Series');
});

test('toPublicBook copies the tag array rather than aliasing the model', () => {
  const book = Book.build({
    id: 1,
    userId: 2,
    seriesId: 3,
    description: 'A novel',
    tags: ['sci-fi'],
  });

  const output = toPublicBook(book);
  output.tags.push('mutated');

  assert.deepEqual(book.tags, ['sci-fi']);
});

test('toPublicBook parses a JSON string, should a driver return one raw', () => {
  const book = Book.build({
    id: 1,
    userId: 2,
    description: 'A novel',
    tags: ['sci-fi'],
  });
  // A raw string is the shape a non-parsing driver would hand back; without
  // normalisation it would be spread character by character.
  book.setDataValue('tags', '["sci-fi","epic"]' as unknown as string[]);

  assert.deepEqual(toPublicBook(book).tags, ['sci-fi', 'epic']);
});

test('toPublicBook reports a standalone book as seriesId: null, never undefined', () => {
  const book = Book.build({
    id: 1,
    userId: 2,
    description: 'Standalone',
    tags: [],
  });

  const output = toPublicBook(book);

  assert.equal(output.seriesId, null);
  assert.ok('seriesId' in output);
});
