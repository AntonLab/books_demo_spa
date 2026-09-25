process.env.NODE_ENV ??= 'test';

import { after, before, beforeEach, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import type { Sequelize } from 'sequelize';
import { createSequelize } from '../db/sequelize.ts';
import { ensureDatabase } from '../db/ensureDatabase.ts';
import { parseConfig } from '../db/config.ts';
import { skipWithoutMysql } from '../db/mysqlProbe.testkit.ts';
import { initModels } from '../models/index.ts';
import { Book } from '../models/Book.ts';
import { Chapter } from '../models/Chapter.ts';
import { Notification } from '../models/Notification.ts';
import { Series } from '../models/Series.ts';
import { User } from '../models/User.ts';
import type { PublicNotification } from 'shared';
import type { Role } from '../types/permission.ts';
import { createSequelizeBookRepository } from './bookRepository.ts';
import { createSequelizeNotificationRepository } from './notificationRepository.ts';
import { createSequelizeSeriesRepository } from './seriesRepository.ts';
import { createSequelizeUserRepository } from './userRepository.ts';

// A schema of its own, for the reason every MySQL-backed suite gives: node:test
// runs spec files in parallel processes, and two suites calling
// sync({ force: true }) on one database would drop each other's tables.
const TEST_DB_NAME = `${process.env.TEST_DB_NAME ?? 'books_demo_spa_test'}_notifications`;

function testDbConfig() {
  const config = parseConfig({
    ...process.env,
    NODE_ENV: 'test',
    DB_NAME: TEST_DB_NAME,
  });
  return config.db;
}

const skip = await skipWithoutMysql();

describe('notifications against real MySQL', { skip }, () => {
  let sequelize: Sequelize;
  const notifications = createSequelizeNotificationRepository();
  const books = createSequelizeBookRepository();
  const series = createSequelizeSeriesRepository();
  const users = createSequelizeUserRepository();

  let ann: { id: number; role: Role };
  let ben: { id: number; role: Role };
  let cleo: { id: number; role: Role };
  const moderator = (): { id: number; role: Role } => ({
    id: ann.id + 10_000,
    role: 'admin',
  });

  const account = async (login: string, firstName: string) => {
    const created = await users.create(
      {
        login,
        email: `${login}@example.com`,
        password: 'hunter2hunter2',
        firstName,
        lastName: 'Writer',
      },
      'author'
    );
    return { id: created.id, role: 'author' as Role };
  };

  // Every notification an account holds, oldest first, as the parts a test
  // asserts on.
  const inbox = async (userId: number) =>
    (
      await Notification.findAll({ where: { userId }, order: [['id', 'ASC']] })
    ).map((row) => ({
      kind: row.kind,
      workType: row.workType,
      workTitle: row.workTitle,
      bookId: row.bookId ?? null,
      seriesId: row.seriesId ?? null,
      actorKind: row.actorKind,
      actorName: row.actorName ?? null,
      isRead: row.isRead,
    }));

  // The same events on both kinds of work, through each kind's repository.
  const works = {
    book: {
      async create(title: string, ownerId: number) {
        return (
          await books.create({
            userId: ownerId,
            seriesId: null,
            title,
            description: 'x',
            tags: [],
          })
        ).id;
      },
      addCoAuthor: books.addCoAuthor,
      removeCoAuthor: books.removeCoAuthor,
      remove: books.remove,
      link: (id: number | null) => ({ bookId: id, seriesId: null }),
    },
    series: {
      async create(title: string, ownerId: number) {
        return (
          await series.create({
            userId: ownerId,
            title,
            description: 'x',
            tags: [],
          })
        ).id;
      },
      addCoAuthor: series.addCoAuthor,
      removeCoAuthor: series.removeCoAuthor,
      remove: series.remove,
      link: (id: number | null) => ({ bookId: null, seriesId: id }),
    },
  } as const;

  before(async () => {
    const db = testDbConfig();
    await ensureDatabase(db);
    sequelize = createSequelize(db);
    initModels(sequelize);
    await sequelize.sync({ force: true });
  });

  after(async () => {
    await sequelize.close();
  });

  beforeEach(async () => {
    // Notifications go with their recipients; books and series only unlink
    // them, so they are cleared first for a clean count.
    await Notification.destroy({ where: {}, truncate: false });
    await Chapter.destroy({ where: {}, truncate: false });
    await Book.destroy({ where: {}, truncate: false });
    await Series.destroy({ where: {}, truncate: false });
    await User.destroy({ where: {}, truncate: false });
    ann = await account('ann', 'Ann');
    ben = await account('ben', 'Ben');
    cleo = await account('cleo', 'Cleo');
  });

  for (const [workType, work] of Object.entries(works)) {
    test(`${workType}: someone adds you as a co-author — you are told, by name`, async () => {
      const id = await work.create('Shared', ann.id);

      await work.addCoAuthor(id, ben.id, ann);

      assert.deepEqual(await inbox(ben.id), [
        {
          kind: 'co_author_added',
          workType,
          workTitle: 'Shared',
          ...work.link(id),
          actorKind: 'co_author',
          actorName: 'Ann Writer',
          isRead: false,
        },
      ]);
      assert.deepEqual(await inbox(ann.id), []);
    });

    test(`${workType}: someone removes you — you are told, and nobody else`, async () => {
      const id = await work.create('Shared', ann.id);
      await work.addCoAuthor(id, ben.id, ann);
      await work.addCoAuthor(id, cleo.id, ann);
      await Notification.destroy({ where: {} });

      await work.removeCoAuthor(id, ben.id, ann);

      assert.deepEqual(
        (await inbox(ben.id)).map((row) => [row.kind, row.actorName]),
        [['co_author_removed', 'Ann Writer']]
      );
      assert.deepEqual(await inbox(ann.id), []);
      assert.deepEqual(await inbox(cleo.id), []);
    });

    test(`${workType}: a co-author leaves — the ones who remain are told`, async () => {
      const id = await work.create('Shared', ann.id);
      await work.addCoAuthor(id, ben.id, ann);
      await work.addCoAuthor(id, cleo.id, ann);
      await Notification.destroy({ where: {} });

      await work.removeCoAuthor(id, cleo.id, cleo);

      for (const remaining of [ann, ben]) {
        assert.deepEqual(
          (await inbox(remaining.id)).map((row) => [
            row.kind,
            row.actorName,
            row.workTitle,
          ]),
          [['co_author_left', 'Cleo Writer', 'Shared']]
        );
      }
      assert.deepEqual(await inbox(cleo.id), []);
    });

    test(`${workType}: a co-author deletes it — every other co-author is told, with no link left`, async () => {
      const id = await work.create('Doomed', ann.id);
      await work.addCoAuthor(id, ben.id, ann);
      await Notification.destroy({ where: {} });

      await work.remove(id, ben);

      assert.deepEqual(await inbox(ann.id), [
        {
          kind: 'work_deleted',
          workType,
          workTitle: 'Doomed',
          ...work.link(null),
          actorKind: 'co_author',
          actorName: 'Ben Writer',
          isRead: false,
        },
      ]);
      assert.deepEqual(await inbox(ben.id), []);
    });

    test(`${workType}: a moderator deletes it — every co-author is told, and the moderator is not named`, async () => {
      const id = await work.create('Removed', ann.id);
      await work.addCoAuthor(id, ben.id, ann);
      await Notification.destroy({ where: {} });

      await work.remove(id, moderator());

      for (const coAuthor of [ann, ben]) {
        assert.deepEqual(
          (await inbox(coAuthor.id)).map((row) => [
            row.kind,
            row.actorKind,
            row.actorName,
          ]),
          [['work_deleted', 'moderator', null]]
        );
      }
    });

    test(`${workType}: a change that fails raises nothing`, async () => {
      const id = await work.create('Solo', ann.id);
      await work.addCoAuthor(id, ben.id, ann);
      await Notification.destroy({ where: {} });

      // A second credit is a 409; the last co-author cannot leave.
      await assert.rejects(work.addCoAuthor(id, ben.id, ann));
      await work.removeCoAuthor(id, ben.id, ann);
      await Notification.destroy({ where: {} });
      await assert.rejects(work.removeCoAuthor(id, ann.id, ann));

      assert.equal(await Notification.count(), 0);
    });
  }

  test('text, status and chapter changes raise nothing', async () => {
    const bookId = await works.book.create('Quiet', ann.id);
    await books.addCoAuthor(bookId, ben.id, ann);
    const seriesId = await works.series.create('Quiet Series', ann.id);
    await series.addCoAuthor(seriesId, ben.id, ann);
    await Notification.destroy({ where: {} });

    await books.update(bookId, {
      title: 'Louder',
      description: 'Rewritten',
      status: 'complete',
      seriesId,
    });
    await series.update(seriesId, { title: 'Louder Series' });
    await Chapter.create({
      bookId,
      title: 'One',
      text: 'a',
      publishedAt: new Date(),
      position: 1,
    });

    assert.equal(await Notification.count(), 0);
  });

  test('a co-author’s account is deleted — the co-authors who remain are told of each shared work, as by a deleted account', async () => {
    const sharedBook = await works.book.create('Shared Book', ann.id);
    await books.addCoAuthor(sharedBook, ben.id, ann);
    const sharedSeries = await works.series.create('Shared Series', ben.id);
    await series.addCoAuthor(sharedSeries, ann.id, ben);
    await works.book.create('Ann Alone', ann.id);
    await Notification.destroy({ where: {} });

    await users.remove(ann.id);

    assert.deepEqual(await inbox(ben.id), [
      {
        kind: 'co_author_account_deleted',
        workType: 'series',
        workTitle: 'Shared Series',
        bookId: null,
        seriesId: sharedSeries,
        actorKind: 'deleted_account',
        actorName: null,
        isRead: false,
      },
      {
        kind: 'co_author_account_deleted',
        workType: 'book',
        workTitle: 'Shared Book',
        bookId: sharedBook,
        seriesId: null,
        actorKind: 'deleted_account',
        actorName: null,
        isRead: false,
      },
    ]);
    // The work Ann alone was credited on went with her, and told nobody.
    assert.equal(await Notification.count(), 2);
  });

  test('the snapshot outlives a renamed and deleted work and the deleted actor', async () => {
    const id = await works.book.create('As It Was', ann.id);
    await books.addCoAuthor(id, ben.id, ann);

    await books.update(id, { title: 'As It Became' });
    await books.remove(id, moderator());
    await users.remove(ann.id);

    const [deleted, added] = (
      await notifications.list(ben.id, { limit: 20, offset: 0 })
    ).items;
    // Each keeps the title the work had when it was raised, and the link is
    // gone with the book.
    assert.deepEqual(deleted?.work, {
      type: 'book',
      id: null,
      title: 'As It Became',
    });
    assert.deepEqual(added?.work, {
      type: 'book',
      id: null,
      title: 'As It Was',
    });
    // Ann's account is gone; her name, as it was, is not.
    assert.deepEqual(added?.actor, { kind: 'co_author', name: 'Ann Writer' });
  });

  test('an account lists only its own notifications, newest first, with its unread count', async () => {
    const first = await works.book.create('First', ann.id);
    await books.addCoAuthor(first, ben.id, ann);
    const second = await works.series.create('Second', ann.id);
    await series.addCoAuthor(second, ben.id, ann);
    await series.addCoAuthor(second, cleo.id, ann);

    const page = await notifications.list(ben.id, { limit: 20, offset: 0 });

    assert.equal(page.total, 2);
    assert.equal(page.unread, 2);
    assert.deepEqual(
      page.items.map((item: PublicNotification) => item.work.title),
      ['Second', 'First']
    );
    const paged = await notifications.list(ben.id, { limit: 1, offset: 1 });
    assert.deepEqual(
      paged.items.map((item) => item.work.title),
      ['First']
    );
    assert.equal(paged.total, 2);
  });

  test('marking read touches only the caller’s own notifications and reports what is left unread', async () => {
    const id = await works.series.create('Shared', ann.id);
    await series.addCoAuthor(id, ben.id, ann);
    await series.addCoAuthor(id, cleo.id, ann);
    const [bens] = (await notifications.list(ben.id, { limit: 20, offset: 0 }))
      .items;
    const [cleos] = (
      await notifications.list(cleo.id, { limit: 20, offset: 0 })
    ).items;
    assert.ok(bens && cleos);

    // Cleo's id alongside Ben's own: only Ben's is his to mark.
    assert.equal(await notifications.markRead(ben.id, [bens.id, cleos.id]), 0);

    assert.equal(
      (await notifications.list(ben.id, { limit: 20, offset: 0 })).items[0]
        ?.isRead,
      true
    );
    assert.equal(
      (await notifications.list(cleo.id, { limit: 20, offset: 0 })).unread,
      1
    );
  });
});
