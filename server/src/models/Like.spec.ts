import test from 'node:test';
import assert from 'node:assert/strict';
import { Sequelize } from 'sequelize';
import { Book, Comment, User, initModels } from './index.ts';
import { Like, toPublicLike } from './Like.ts';

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
  const attributes = generator.attributesToSQL(Like.getAttributes(), {
    table: 'likes',
  });

  return generator.createTableQuery('likes', attributes, {
    charset: 'utf8mb4',
    collate: 'utf8mb4_0900_ai_ci',
    engine: 'InnoDB',
  });
})();

test('the foreign keys match the columns they reference (INTEGER UNSIGNED)', () => {
  assert.match(createTableSql, /`id` INTEGER UNSIGNED auto_increment/);
  assert.match(createTableSql, /`userId` INTEGER UNSIGNED NOT NULL/);
});

// Both targets have to be nullable for the XOR to be expressible at all —
// every row leaves exactly one of them empty.
test('both targets are nullable, because a like fills exactly one', () => {
  assert.match(createTableSql, /`bookId` INTEGER UNSIGNED,/);
  assert.match(createTableSql, /`commentId` INTEGER UNSIGNED,/);
});

test('isLike is a NOT NULL boolean — a row is a like or a dislike', () => {
  assert.match(createTableSql, /`isLike` TINYINT\(1\) NOT NULL/);
});

test('createdAt is NOT NULL, and there is no updatedAt column', () => {
  assert.match(createTableSql, /`createdAt` DATETIME NOT NULL/);
  assert.doesNotMatch(createTableSql, /updatedAt/);
});

// CASCADE on both targets, not the SET NULL that books.seriesId and
// comments.parentId use: a like whose target is gone would have both columns
// null, which is the one state the XOR forbids.
test('all three foreign keys cascade — an orphaned like breaks the XOR', () => {
  assert.match(
    createTableSql,
    /FOREIGN KEY \(`userId`\) REFERENCES `users` \(`id`\) ON DELETE CASCADE ON UPDATE CASCADE/
  );
  assert.match(
    createTableSql,
    /FOREIGN KEY \(`bookId`\) REFERENCES `books` \(`id`\) ON DELETE CASCADE ON UPDATE CASCADE/
  );
  assert.match(
    createTableSql,
    /FOREIGN KEY \(`commentId`\) REFERENCES `comments` \(`id`\) ON DELETE CASCADE ON UPDATE CASCADE/
  );
});

test('the table is InnoDB with the utf8mb4 default collation', () => {
  assert.match(
    createTableSql,
    /ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE utf8mb4_0900_ai_ci/
  );
});

// Four indexes, each doing two jobs: the pair ending in `id` serves a filter
// plus ORDER BY id and indexes its foreign key, and the unique pair enforces
// one like per user per target while indexing userId. A fifth (userId, id)
// index would spare `?userId=` a filesort, but likes are write-heavy and that
// sort runs over one user's own rows.
test('four indexes cover the filters, the foreign keys and the uniqueness', () => {
  assert.deepEqual(
    Like.options.indexes?.map((index) => [index.fields, index.unique === true]),
    [
      [['bookId', 'id'], false],
      [['commentId', 'id'], false],
      [['userId', 'bookId'], true],
      [['userId', 'commentId'], true],
    ]
  );
});

test('Like belongs to a User, a Book and a Comment, which all have many likes', () => {
  assert.equal(Like.associations.user?.associationType, 'BelongsTo');
  assert.equal(Like.associations.user?.target.name, 'User');
  assert.equal(Like.associations.book?.associationType, 'BelongsTo');
  assert.equal(Like.associations.book?.target.name, 'Book');
  assert.equal(Like.associations.comment?.associationType, 'BelongsTo');
  assert.equal(Like.associations.comment?.target.name, 'Comment');
  assert.equal(User.associations.likes?.target.name, 'Like');
  assert.equal(Book.associations.likes?.target.name, 'Like');
  assert.equal(Comment.associations.likes?.target.name, 'Like');
});

test('toPublicLike normalises an unset target to null, as books do for seriesId', () => {
  const like = Like.build({ id: 1, userId: 2, bookId: 3, isLike: true });

  assert.deepEqual(toPublicLike(like), {
    id: 1,
    userId: 2,
    bookId: 3,
    commentId: null,
    isLike: true,
    createdAt: undefined,
  });
});

// The schema layer refuses a bad target too, but a caller reaching Sequelize
// directly never passes through zod — and MySQL cannot be given the CHECK
// constraint that would catch it, so this validator is the last line.
test('a like naming both targets fails validation', async () => {
  const like = Like.build({
    userId: 1,
    bookId: 2,
    commentId: 3,
    isLike: true,
    createdAt: new Date(),
  });

  await assert.rejects(
    () => like.validate(),
    /Exactly one of bookId or commentId/
  );
});

test('a like naming neither target fails validation', async () => {
  const like = Like.build({ userId: 1, isLike: true, createdAt: new Date() });

  await assert.rejects(
    () => like.validate(),
    /Exactly one of bookId or commentId/
  );
});

test('a like naming exactly one target validates', async () => {
  const like = Like.build({
    userId: 1,
    commentId: 3,
    isLike: false,
    createdAt: new Date(),
  });

  await assert.doesNotReject(() => like.validate());
});
