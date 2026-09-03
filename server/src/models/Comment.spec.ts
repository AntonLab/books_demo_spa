import test from 'node:test';
import assert from 'node:assert/strict';
import { Sequelize } from 'sequelize';
import { Book, User, initModels } from './index.ts';
import { Comment, toPublicComment } from './Comment.ts';

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
  const attributes = generator.attributesToSQL(Comment.getAttributes(), {
    table: 'comments',
  });

  return generator.createTableQuery('comments', attributes, {
    charset: 'utf8mb4',
    collate: 'utf8mb4_0900_ai_ci',
    engine: 'InnoDB',
  });
})();

test('text is TEXT, not the MEDIUMTEXT a chapter body needs', () => {
  assert.match(createTableSql, /`text` TEXT NOT NULL/);
});

test('the foreign keys match the columns they reference (INTEGER UNSIGNED)', () => {
  assert.match(createTableSql, /`id` INTEGER UNSIGNED auto_increment/);
  assert.match(createTableSql, /`userId` INTEGER UNSIGNED NOT NULL/);
  assert.match(createTableSql, /`bookId` INTEGER UNSIGNED NOT NULL/);
});

test('parentId is nullable — a top-level comment replies to nothing', () => {
  assert.match(createTableSql, /`parentId` INTEGER UNSIGNED,/);
});

test('the owning user and book cascade, as they do for series and chapters', () => {
  assert.match(
    createTableSql,
    /FOREIGN KEY \(`userId`\) REFERENCES `users` \(`id`\) ON DELETE CASCADE ON UPDATE CASCADE/
  );
  assert.match(
    createTableSql,
    /FOREIGN KEY \(`bookId`\) REFERENCES `books` \(`id`\) ON DELETE CASCADE ON UPDATE CASCADE/
  );
});

// The self-reference cannot copy either of the shapes above. Measured against
// MySQL 8.0.46: with ON DELETE CASCADE, deleting a thread nested deeper than
// 15 fails with ER_FK_DEPTH_EXCEEDED (errno 3008) — and so does deleting the
// *book* that owns it, which turns a routine delete into an error nobody asked
// for. With ON DELETE RESTRICT that same book delete fails with errno 1451,
// because the cascade into comments trips over the replies. SET NULL is the
// only action that leaves both operations working.
test('a deleted comment unlinks its replies rather than cascading into them', () => {
  assert.match(
    createTableSql,
    /FOREIGN KEY \(`parentId`\) REFERENCES `comments` \(`id`\) ON DELETE SET NULL ON UPDATE RESTRICT/
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

test('every filter column is indexed alongside id, so none needs a filesort', () => {
  assert.deepEqual(
    Comment.options.indexes?.map((index) => index.fields),
    [
      ['bookId', 'id'],
      ['userId', 'id'],
      ['parentId', 'id'],
    ]
  );
});

test('Comment belongs to a User and a Book, which both have many comments', () => {
  assert.equal(Comment.associations.user?.associationType, 'BelongsTo');
  assert.equal(Comment.associations.user?.target.name, 'User');
  assert.equal(Comment.associations.book?.associationType, 'BelongsTo');
  assert.equal(Comment.associations.book?.target.name, 'Book');
  assert.equal(User.associations.comments?.associationType, 'HasMany');
  assert.equal(User.associations.comments?.target.name, 'Comment');
  assert.equal(Book.associations.comments?.associationType, 'HasMany');
  assert.equal(Book.associations.comments?.target.name, 'Comment');
});

test('Comment also points at itself, so a reply hangs off its parent', () => {
  assert.equal(Comment.associations.parent?.associationType, 'BelongsTo');
  assert.equal(Comment.associations.parent?.target.name, 'Comment');
  assert.equal(Comment.associations.replies?.associationType, 'HasMany');
  assert.equal(Comment.associations.replies?.target.name, 'Comment');
});

test('toPublicComment carries the body — a comment is its text', () => {
  const comment = Comment.build({
    id: 1,
    parentId: null,
    userId: 2,
    bookId: 3,
    text: 'Loved the ending.',
  });

  assert.deepEqual(toPublicComment(comment), {
    id: 1,
    parentId: null,
    userId: 2,
    bookId: 3,
    text: 'Loved the ending.',
    createdAt: undefined,
    updatedAt: undefined,
  });
});

test('toPublicComment normalises a missing parentId to null, as books do for seriesId', () => {
  const comment = Comment.build({
    userId: 2,
    bookId: 3,
    text: 'A reply to nothing.',
  });

  assert.equal(toPublicComment(comment).parentId, null);
});
