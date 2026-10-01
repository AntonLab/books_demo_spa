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
    /`kind` ENUM\('co_author_added', 'co_author_removed', 'co_author_left', 'co_author_account_deleted', 'work_deleted', 'new_chapter', 'new_book'\) NOT NULL/
  );
  assert.match(createTableSql, /`workType` ENUM\('book', 'series'\) NOT NULL/);
  assert.match(createTableSql, /`workTitle` VARCHAR\(255\) NOT NULL/);
});

// Nullable because an announcement has no actor; toPublicNotification refuses
// a credit row without one.
test('the actor is kept as a kind and, for a co-author, a name', () => {
  assert.match(
    createTableSql,
    /`actorKind` ENUM\('co_author', 'moderator', 'deleted_account'\),/
  );
  assert.match(createTableSql, /`actorName` VARCHAR\(255\),/);
});

test('an announcement keeps its chapter link and count, and the titles as they were', () => {
  assert.match(createTableSql, /`chapterId` INTEGER UNSIGNED,/);
  assert.match(createTableSql, /`chapterTitle` VARCHAR\(255\),/);
  assert.match(createTableSql, /`chapterCount` INTEGER UNSIGNED,/);
  assert.match(createTableSql, /`seriesTitle` VARCHAR\(255\),/);
  assert.match(
    createTableSql,
    /FOREIGN KEY \(`chapterId`\) REFERENCES `chapters` \(`id`\) ON DELETE SET NULL ON UPDATE CASCADE/
  );
});

test('a notification starts unread (null readAt), and keeps createdAt alone', () => {
  assert.match(createTableSql, /`readAt` DATETIME,/);
  assert.doesNotMatch(createTableSql, /isRead/);
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

test('a recipient’s notifications are indexed by when they were read', () => {
  assert.deepEqual(
    Notification.options.indexes?.map((index) => index.fields),
    [['userId', 'readAt']]
  );
  assert.equal(
    Notification.options.indexes?.[0]?.name,
    'notifications_user_id_read_at'
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
    readAt: null,
    createdAt,
  });

  assert.deepEqual(toPublicNotification(book), {
    id: 1,
    kind: 'co_author_added',
    work: { type: 'book', id: 7, title: 'The Glass Harbour' },
    actor: { kind: 'co_author', name: 'Margaret Hale' },
    readAt: null,
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
    readAt: new Date('2026-09-13T10:05:00.000Z'),
    createdAt,
  });
  assert.deepEqual(
    toPublicNotification(deletedSeries).readAt,
    new Date('2026-09-13T10:05:00.000Z')
  );
  assert.deepEqual(toPublicNotification(deletedSeries).work, {
    type: 'series',
    id: null,
    title: 'Letters from Blackmoor',
  });
  const publicDeleted = toPublicNotification(deletedSeries);
  assert.ok(publicDeleted.kind === 'work_deleted');
  assert.deepEqual(publicDeleted.actor, { kind: 'moderator', name: null });
});

test('a New chapter names the book, the first new chapter and how many there are', () => {
  const createdAt = new Date('2026-09-26T10:00:00.000Z');
  const row = Notification.build({
    id: 3,
    userId: 2,
    kind: 'new_chapter',
    workType: 'book',
    bookId: 7,
    workTitle: 'The Glass Harbour',
    chapterId: 70,
    chapterTitle: 'The Tide Bell',
    chapterCount: 2,
    readAt: null,
    createdAt,
  });

  assert.deepEqual(toPublicNotification(row), {
    id: 3,
    kind: 'new_chapter',
    work: { type: 'book', id: 7, title: 'The Glass Harbour' },
    chapter: { id: 70, title: 'The Tide Bell' },
    chapterCount: 2,
    readAt: null,
    createdAt,
  });
});

test('a New chapter whose chapter is gone keeps its title and loses only the link', () => {
  const row = Notification.build({
    id: 4,
    userId: 2,
    kind: 'new_chapter',
    workType: 'book',
    bookId: 7,
    workTitle: 'The Glass Harbour',
    chapterId: null,
    chapterTitle: 'The Tide Bell',
    chapterCount: 1,
    createdAt: new Date(),
  });

  const notification = toPublicNotification(row);
  assert.ok(notification.kind === 'new_chapter');
  assert.deepEqual(notification.chapter, { id: null, title: 'The Tide Bell' });
});

test('a New book names the book and its series', () => {
  const createdAt = new Date('2026-09-26T10:00:00.000Z');
  const row = Notification.build({
    id: 5,
    userId: 2,
    kind: 'new_book',
    workType: 'book',
    bookId: 9,
    seriesId: 4,
    workTitle: 'The Nightbus Returns',
    seriesTitle: 'The Nightbus Files',
    readAt: createdAt,
    createdAt,
  });

  assert.deepEqual(toPublicNotification(row), {
    id: 5,
    kind: 'new_book',
    work: { type: 'book', id: 9, title: 'The Nightbus Returns' },
    series: { id: 4, title: 'The Nightbus Files' },
    readAt: createdAt,
    createdAt,
  });
});

test('a credit notification without an actor is refused, not sent half-filled', () => {
  const row = Notification.build({
    id: 6,
    userId: 2,
    kind: 'co_author_added',
    workType: 'book',
    bookId: 7,
    workTitle: 'The Glass Harbour',
    actorKind: null,
    createdAt: new Date(),
  });

  assert.throws(() => toPublicNotification(row), /Notification 6 has no actor/);
});
