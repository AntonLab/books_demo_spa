import test from 'node:test';
import assert from 'node:assert/strict';
import { Sequelize } from 'sequelize';
import { initModels } from './index.ts';
import { Notification, toPublicNotification } from './Notification.ts';

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
  const attributes = generator.attributesToSQL(Notification.getAttributes(), {
    table: 'notifications',
  });

  return generator.createTableQuery('notifications', attributes, {
    charset: 'utf8mb4',
    collate: 'utf8mb4_0900_ai_ci',
    engine: 'InnoDB',
  });
})();

test('every notification has a recipient, a kind, a work type and a title', () => {
  assert.match(createTableSql, /`userId` INTEGER UNSIGNED NOT NULL/);
  assert.match(
    createTableSql,
    /`kind` ENUM\('co_author_added', 'co_author_removed', 'co_author_left', 'co_author_account_deleted', 'work_deleted'\) NOT NULL/
  );
  assert.match(createTableSql, /`workType` ENUM\('book', 'series'\) NOT NULL/);
  assert.match(createTableSql, /`workTitle` VARCHAR\(255\) NOT NULL/);
});

test('the actor is kept as a kind and, for a co-author, a name', () => {
  assert.match(
    createTableSql,
    /`actorKind` ENUM\('co_author', 'moderator', 'deleted_account'\) NOT NULL/
  );
  assert.match(createTableSql, /`actorName` VARCHAR\(255\),/);
});

test('a notification starts unread, and keeps createdAt alone', () => {
  assert.match(createTableSql, /`isRead` TINYINT\(1\) NOT NULL DEFAULT false/);
  assert.match(createTableSql, /`createdAt` DATETIME NOT NULL/);
  assert.doesNotMatch(createTableSql, /updatedAt/);
});

// The link is what goes when the work goes; the snapshot beside it stays.
test('the recipient cascades, and each work link is nulled when its work is deleted', () => {
  assert.match(createTableSql, /`bookId` INTEGER UNSIGNED,/);
  assert.match(createTableSql, /`seriesId` INTEGER UNSIGNED,/);
  assert.match(
    createTableSql,
    /FOREIGN KEY \(`userId`\) REFERENCES `users` \(`id`\) ON DELETE CASCADE ON UPDATE CASCADE/
  );
  assert.match(
    createTableSql,
    /FOREIGN KEY \(`bookId`\) REFERENCES `books` \(`id`\) ON DELETE SET NULL ON UPDATE CASCADE/
  );
  assert.match(
    createTableSql,
    /FOREIGN KEY \(`seriesId`\) REFERENCES `series` \(`id`\) ON DELETE SET NULL ON UPDATE CASCADE/
  );
});

test('a recipient’s unread notifications are indexed', () => {
  assert.deepEqual(
    Notification.options.indexes?.map((index) => index.fields),
    [['userId', 'isRead']]
  );
});

test('toPublicNotification nests the work and the actor, with the link of whichever work it names', () => {
  const createdAt = new Date('2026-09-13T10:00:00.000Z');
  const book = Notification.build({
    id: 1,
    userId: 2,
    kind: 'co_author_added',
    workType: 'book',
    bookId: 7,
    seriesId: null,
    workTitle: 'The Glass Harbour',
    actorKind: 'co_author',
    actorName: 'Margaret Hale',
    isRead: false,
    createdAt,
  });

  assert.deepEqual(toPublicNotification(book), {
    id: 1,
    kind: 'co_author_added',
    work: { type: 'book', id: 7, title: 'The Glass Harbour' },
    actor: { kind: 'co_author', name: 'Margaret Hale' },
    isRead: false,
    createdAt,
  });

  const deletedSeries = Notification.build({
    id: 2,
    userId: 2,
    kind: 'work_deleted',
    workType: 'series',
    workTitle: 'Letters from Blackmoor',
    actorKind: 'moderator',
    actorName: null,
    isRead: true,
    createdAt,
  });
  assert.deepEqual(toPublicNotification(deletedSeries).work, {
    type: 'series',
    id: null,
    title: 'Letters from Blackmoor',
  });
  assert.deepEqual(toPublicNotification(deletedSeries).actor, {
    kind: 'moderator',
    name: null,
  });
});
