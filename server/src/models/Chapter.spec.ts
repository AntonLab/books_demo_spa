import test from 'node:test';
import assert from 'node:assert/strict';
import { Sequelize } from 'sequelize';
import { Book, initModels } from './index.ts';
import { Chapter, toChapterSummary, toPublicChapter } from './Chapter.ts';

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
  const attributes = generator.attributesToSQL(Chapter.getAttributes(), {
    table: 'chapters',
  });

  return generator.createTableQuery('chapters', attributes, {
    charset: 'utf8mb4',
    collate: 'utf8mb4_0900_ai_ci',
    engine: 'InnoDB',
  });
})();

test('text is MEDIUMTEXT, since TEXT caps at ~16k characters under utf8mb4', () => {
  assert.match(createTableSql, /`text` MEDIUMTEXT NOT NULL/);
});

test('title is VARCHAR(255), the width its schema validates against', () => {
  assert.match(createTableSql, /`title` VARCHAR\(255\) NOT NULL/);
});

test('bookId matches books.id exactly, or MySQL rejects the foreign key', () => {
  assert.match(createTableSql, /`bookId` INTEGER UNSIGNED NOT NULL/);
  assert.match(createTableSql, /`id` INTEGER UNSIGNED auto_increment/);
});

test('Book.hasMany(Chapter) cascades — a chapter outside a book is meaningless', () => {
  assert.match(
    createTableSql,
    /FOREIGN KEY \(`bookId`\) REFERENCES `books` \(`id`\) ON DELETE CASCADE ON UPDATE CASCADE/
  );
});

test('the timestamps are NOT NULL', () => {
  assert.match(createTableSql, /`createdAt` DATETIME NOT NULL/);
  assert.match(createTableSql, /`updatedAt` DATETIME NOT NULL/);
});

test('the table is InnoDB with the utf8mb4 default collation', () => {
  assert.match(
    createTableSql,
    /ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE utf8mb4_0900_ai_ci/
  );
});

test('the owner filter is indexed alongside id, so it needs no filesort', () => {
  assert.deepEqual(
    Chapter.options.indexes?.map((index) => index.fields),
    [['bookId', 'id']]
  );
});

test('Chapter belongs to Book, and Book has many chapters', () => {
  assert.equal(Chapter.associations.book?.associationType, 'BelongsTo');
  assert.equal(Chapter.associations.book?.target.name, 'Book');
  assert.equal(Book.associations.chapters?.associationType, 'HasMany');
  assert.equal(Book.associations.chapters?.target.name, 'Chapter');
});

test('toPublicChapter carries the body, since it serves GET /:id', () => {
  const chapter = Chapter.build({
    id: 1,
    bookId: 2,
    title: 'Chapter One',
    text: 'It was a dark night.',
  });

  assert.deepEqual(toPublicChapter(chapter), {
    id: 1,
    bookId: 2,
    title: 'Chapter One',
    text: 'It was a dark night.',
    createdAt: undefined,
    updatedAt: undefined,
  });
});

test('toChapterSummary drops the body but keeps the title', () => {
  const chapter = Chapter.build({
    id: 1,
    bookId: 2,
    title: 'Chapter One',
    text: 'It was a dark night.',
  });

  const summary = toChapterSummary(chapter);

  assert.equal(summary.title, 'Chapter One');
  assert.ok(!('text' in summary));
});
