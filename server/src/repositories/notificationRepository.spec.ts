process.env.NODE_ENV ??= 'test';

import {
  after,
  afterEach,
  before,
  beforeEach,
  describe,
  test,
} from 'node:test';
import assert from 'node:assert/strict';
import type { Sequelize } from 'sequelize';
import { createSequelize } from '../db/sequelize.ts';
import { ensureDatabase } from '../db/ensureDatabase.ts';
import { parseConfig } from '../db/config.ts';
import { skipWithoutMysql } from '../db/mysqlProbe.testkit.ts';
import { NotFoundError } from '../types/errors.ts';
import { initModels } from '../models/index.ts';
import { Book } from '../models/Book.ts';
import { Chapter } from '../models/Chapter.ts';
import { Notification } from '../models/Notification.ts';
import { Series } from '../models/Series.ts';
import { User } from '../models/User.ts';
import type { PublicNotification } from 'shared';
import type { Role } from '../types/permission.ts';
import { createSequelizeBookRepository } from './bookRepository.ts';
import {
  createSequelizeNotificationRepository,
  notify,
} from './notificationRepository.ts';
import { createSequelizeSeriesRepository } from './seriesRepository.ts';
import { createSequelizeUserRepository } from './userRepository.ts';
import { recordLogs } from '../logger.testkit.ts';
import { setNotificationPublisher } from '../online/notificationPublisher.ts';

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
      readAt: row.readAt ?? null,
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

  // The publisher is process-wide; a test that sets one must not leak it into
  // the next.
  afterEach(() => {
    setNotificationPublisher(null);
  });

  test('a committed change pushes each notification it wrote to its recipient', async () => {
    const pushed: Array<{ userId: number; notification: PublicNotification }> =
      [];
    setNotificationPublisher((userId, notification) => {
      pushed.push({ userId, notification });
    });
    const bookId = await works.book.create('Pushed', ann.id);

    await books.addCoAuthor(bookId, ben.id, ann);

    const stored = (await notifications.list(ben.id, { limit: 20, offset: 0 }))
      .items;
    assert.equal(stored.length, 1);
    assert.equal(pushed.length, 1);
    assert.equal(pushed[0]!.userId, ben.id);
    // createdAt is compared as null: MySQL stores whole seconds, while the
    // pushed row still holds the milliseconds Sequelize stamped it with.
    assert.deepEqual(
      { ...pushed[0]!.notification, createdAt: null },
      { ...stored[0]!, createdAt: null }
    );
  });

  test('a change that rolls back pushes nothing, and nothing is pushed before commit', async () => {
    const pushed: number[] = [];
    setNotificationPublisher((userId) => {
      pushed.push(userId);
    });
    const bookId = await works.book.create('Rolled back', ann.id);

    await assert.rejects(
      sequelize.transaction(async (transaction) => {
        await notify(
          [
            {
              recipientIds: [ben.id],
              kind: 'co_author_added',
              work: { type: 'book', id: bookId, title: 'Rolled back' },
              actorKind: 'co_author',
              actorName: 'Ann Writer',
            },
          ],
          ann.id,
          transaction
        );
        // Written but not committed: a push now could name a row that the
        // rollback below takes back.
        assert.deepEqual(pushed, []);
        throw new Error('roll back');
      }),
      /roll back/
    );

    assert.deepEqual(pushed, []);
    assert.equal(await Notification.count(), 0);
  });

  test('a push that throws is logged, and the change it followed still stands', async (t) => {
    const logs = recordLogs(t);
    setNotificationPublisher(() => {
      throw new Error('socket gone');
    });
    const bookId = await works.book.create('Unlucky', ann.id);

    await books.addCoAuthor(bookId, ben.id, ann);

    assert.equal((await inbox(ben.id)).length, 1);
    assert.deepEqual(
      logs.filter((line) => line.level === 'error').map((line) => line.message),
      ['Could not push a notification']
    );
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
          readAt: null,
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
          readAt: null,
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
        readAt: null,
      },
      {
        kind: 'co_author_account_deleted',
        workType: 'book',
        workTitle: 'Shared Book',
        bookId: sharedBook,
        seriesId: null,
        actorKind: 'deleted_account',
        actorName: null,
        readAt: null,
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
    assert.ok(added?.kind === 'co_author_added');
    assert.deepEqual(added.actor, { kind: 'co_author', name: 'Ann Writer' });
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

    assert.ok(
      (await notifications.list(ben.id, { limit: 20, offset: 0 })).items[0]
        ?.readAt instanceof Date
    );
    assert.equal(
      (await notifications.list(cleo.id, { limit: 20, offset: 0 })).unread,
      1
    );
  });

  test('marking read stamps readAt on unread rows and leaves an earlier readAt alone', async () => {
    const id = await works.series.create('Stamped', ann.id);
    await series.addCoAuthor(id, ben.id, ann);
    const earlier = new Date('2026-09-01T10:00:00.000Z');
    const [row] = await Notification.findAll({ where: { userId: ben.id } });
    assert.ok(row);
    assert.equal(row.readAt, null);
    const before = Date.now();

    assert.equal(await notifications.markRead(ben.id, [row.id]), 0);
    // Read off reload()'s result: the null assertion above narrowed row.readAt.
    const { readAt: stamped } = await row.reload();
    assert.ok(stamped && stamped.getTime() >= before - 1000);

    await Notification.update({ readAt: earlier }, { where: { id: row.id } });
    assert.equal(await notifications.markRead(ben.id, [row.id]), 0);
    await row.reload();
    assert.deepEqual(row.readAt, earlier);
  });

  test('a new account has email notifications on', async () => {
    assert.deepEqual(await notifications.getSettings(ann.id), {
      emailNotifications: true,
    });
  });

  test('the email switch round-trips and touches only its own account', async () => {
    assert.deepEqual(
      await notifications.updateSettings(ann.id, { emailNotifications: false }),
      { emailNotifications: false }
    );

    assert.deepEqual(await notifications.getSettings(ann.id), {
      emailNotifications: false,
    });
    assert.deepEqual(await notifications.getSettings(ben.id), {
      emailNotifications: true,
    });
  });

  test('the email switch of a missing account is a NotFoundError naming User', async () => {
    const missing = ann.id + 10_000;

    await assert.rejects(notifications.getSettings(missing), (error) => {
      assert.ok(error instanceof NotFoundError);
      assert.match(error.message, /User/);
      return true;
    });
    await assert.rejects(
      notifications.updateSettings(missing, { emailNotifications: false }),
      NotFoundError
    );
  });
});
