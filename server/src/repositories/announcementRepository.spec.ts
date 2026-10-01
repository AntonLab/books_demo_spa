process.env.NODE_ENV ??= 'test';

import { after, before, beforeEach, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import type { Sequelize } from 'sequelize';
import type { BookStatus, PublicNotification, UserStatus } from 'shared';
import { createSequelize } from '../db/sequelize.ts';
import { ensureDatabase } from '../db/ensureDatabase.ts';
import { parseConfig } from '../db/config.ts';
import { skipWithoutMysql } from '../db/mysqlProbe.testkit.ts';
import { initModels } from '../models/index.ts';
import { Book } from '../models/Book.ts';
import { Chapter } from '../models/Chapter.ts';
import {
  createCreditedBook,
  createCreditedSeries,
} from '../models/creditedBook.testkit.ts';
import { Favorite } from '../models/Favorite.ts';
import { Notification } from '../models/Notification.ts';
import { Series } from '../models/Series.ts';
import { User } from '../models/User.ts';
import { createSequelizeAnnouncementRepository } from './announcementRepository.ts';
import { createSequelizeChapterRepository } from './chapterRepository.ts';
import { createSequelizeUserRepository } from './userRepository.ts';

// A schema of its own, for the reason every MySQL-backed suite gives: node:test
// runs spec files in parallel processes, and two suites calling
// sync({ force: true }) on one database would drop each other's tables.
const TEST_DB_NAME = `${process.env.TEST_DB_NAME ?? 'books_demo_spa_test'}_announcements`;

function testDbConfig() {
  const config = parseConfig({
    ...process.env,
    NODE_ENV: 'test',
    DB_NAME: TEST_DB_NAME,
  });
  return config.db;
}

const skip = await skipWithoutMysql();

const minute = 60_000;
const day = 24 * 60 * minute;
const at = (base: Date, offset: number) => new Date(base.getTime() + offset);

// A notification as a test asserts on it: createdAt is the database's clock.
const timeless = (notification: PublicNotification) =>
  Object.fromEntries(
    Object.entries(notification).filter(([key]) => key !== 'createdAt')
  );

describe('announcements against real MySQL', { skip }, () => {
  let sequelize: Sequelize;
  const announcements = createSequelizeAnnouncementRepository();
  const users = createSequelizeUserRepository();

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

  // A pass announces everything unannounced, so each test starts empty.
  // Children first: MySQL will not delete a referenced row.
  beforeEach(async () => {
    await Notification.destroy({ where: {} });
    await Favorite.destroy({ where: {} });
    await Chapter.destroy({ where: {} });
    await Book.destroy({ where: {} });
    await Series.destroy({ where: {} });
    await User.destroy({ where: {} });
  });

  async function account(
    login: string,
    changes: { status?: UserStatus; emailNotifications?: boolean } = {}
  ): Promise<number> {
    const created = await users.create(
      {
        login,
        email: `${login.toLowerCase()}@example.com`,
        password: 'hunter2hunter2',
        firstName: login,
        lastName: 'Reader',
      },
      'author'
    );
    if (Object.keys(changes).length > 0) {
      await User.update(changes, { where: { id: created.id } });
    }
    return created.id;
  }

  // In progress and announced a day ago unless told otherwise: the state of
  // every Book before the pass under test.
  async function book(
    title: string,
    coAuthorIds: [number, ...number[]],
    options: {
      seriesId?: number;
      status?: BookStatus;
      announced?: boolean;
    } = {}
  ): Promise<number> {
    const created = await createCreditedBook(
      {
        title,
        description: 'x',
        tags: [],
        // Spread only when set: an explicit undefined would override the
        // testkit's defaults.
        ...(options.seriesId === undefined
          ? {}
          : { seriesId: options.seriesId }),
        ...(options.status ? { status: options.status } : {}),
      },
      coAuthorIds
    );
    if (options.announced !== false) {
      await Book.update(
        { announcedAt: new Date(Date.now() - day) },
        { where: { id: created.id } }
      );
    }
    return created.id;
  }

  async function series(
    title: string,
    coAuthorIds: [number, ...number[]]
  ): Promise<number> {
    return (
      await createCreditedSeries(
        { title, description: 'x', tags: [] },
        coAuthorIds
      )
    ).id;
  }

  async function chapter(
    bookId: number,
    title: string,
    position: number,
    publishedAt: Date | null
  ): Promise<number> {
    return (
      await Chapter.create({
        bookId,
        title,
        text: 'Once upon a time.',
        position,
        publishedAt,
      })
    ).id;
  }

  const favorite = (
    userId: number,
    target: { bookId: number } | { seriesId: number }
  ) => Favorite.create({ userId, ...target });

  const chapterAnnouncedAt = async (id: number) =>
    (await Chapter.findByPk(id))?.announcedAt ?? null;

  test("a New chapter reaches the Book's Favorite holders but not its Co-authors, and only once", async () => {
    const now = new Date();
    const writer = await account('Writer');
    const reader = await account('Reader');
    const harbour = await book('The Glass Harbour', [writer]);
    const bell = await chapter(harbour, 'The Tide Bell', 1, at(now, -minute));
    await favorite(reader, { bookId: harbour });
    await favorite(writer, { bookId: harbour });

    const news = await announcements.announce(now);

    assert.equal(news.length, 1);
    const [only] = news;
    assert.ok(only);
    assert.equal(only.userId, reader);
    assert.equal(only.email, 'reader@example.com');
    assert.deepEqual(only.chapters, [
      {
        bookId: harbour,
        bookTitle: 'The Glass Harbour',
        chapterId: bell,
        chapterTitle: 'The Tide Bell',
      },
    ]);
    assert.deepEqual(only.books, []);
    const [notification] = only.notifications;
    assert.ok(notification);
    assert.deepEqual(timeless(notification), {
      id: notification.id,
      kind: 'new_chapter',
      work: { type: 'book', id: harbour, title: 'The Glass Harbour' },
      chapter: { id: bell, title: 'The Tide Bell' },
      chapterCount: 1,
      readAt: null,
    });
    assert.deepEqual(await chapterAnnouncedAt(bell), now);

    assert.deepEqual(await announcements.announce(now), []);
    assert.equal(await Notification.count(), 1);
  });

  test('a Scheduled chapter is announced by the first pass after its Publication time', async () => {
    const now = new Date();
    const writer = await account('Writer');
    const reader = await account('Reader');
    const harbour = await book('The Glass Harbour', [writer]);
    const bell = await chapter(
      harbour,
      'The Tide Bell',
      1,
      at(now, 10 * minute)
    );
    await favorite(reader, { bookId: harbour });

    assert.deepEqual(await announcements.announce(now), []);
    assert.equal(await chapterAnnouncedAt(bell), null);

    const later = at(now, 11 * minute);
    const news = await announcements.announce(later);
    assert.deepEqual(
      news.map((recipient) => recipient.userId),
      [reader]
    );
    assert.deepEqual(await chapterAnnouncedAt(bell), later);
  });

  test('several New chapters of one Book in one pass make one notification that opens the first in Reading order', async () => {
    const now = new Date();
    const writer = await account('Writer');
    const reader = await account('Reader');
    const harbour = await book('The Glass Harbour', [writer]);
    // Created second-first, so neither id order nor creation order is the
    // Reading order.
    const second = await chapter(harbour, 'Low Water', 2, at(now, -minute));
    const first = await chapter(harbour, 'First Light', 1, at(now, -minute));
    await favorite(reader, { bookId: harbour });

    const [only] = await announcements.announce(now);

    assert.ok(only);
    assert.deepEqual(
      only.chapters.map((announced) => announced.chapterId),
      [first, second]
    );
    const [notification] = only.notifications;
    assert.ok(notification?.kind === 'new_chapter');
    assert.deepEqual(notification.chapter, { id: first, title: 'First Light' });
    assert.equal(notification.chapterCount, 2);
    assert.equal(await Notification.count(), 1);
  });

  test('New chapters gather into the unread notification, and start a new one once it is read', async () => {
    const base = new Date();
    const writer = await account('Writer');
    const reader = await account('Reader');
    const harbour = await book('The Glass Harbour', [writer]);
    const first = await chapter(harbour, 'First Light', 1, at(base, -minute));
    const second = await chapter(harbour, 'Low Water', 2, at(base, 30_000));
    const third = await chapter(harbour, 'Slack Tide', 3, at(base, 90_000));
    await favorite(reader, { bookId: harbour });

    const [one] = await announcements.announce(base);
    const opened = one?.notifications[0];
    assert.ok(opened?.kind === 'new_chapter');

    const [two] = await announcements.announce(at(base, minute));
    assert.ok(two);
    assert.deepEqual(
      two.chapters.map((announced) => announced.chapterId),
      [second]
    );
    const grown = two.notifications[0];
    assert.ok(grown?.kind === 'new_chapter');
    assert.equal(grown.id, opened.id);
    assert.equal(grown.chapterCount, 2);
    assert.deepEqual(grown.chapter, { id: first, title: 'First Light' });

    await Notification.update(
      { readAt: new Date() },
      { where: { id: opened.id } }
    );
    const [three] = await announcements.announce(at(base, 2 * minute));
    const fresh = three?.notifications[0];
    assert.ok(fresh?.kind === 'new_chapter');
    assert.notEqual(fresh.id, opened.id);
    assert.equal(fresh.chapterCount, 1);
    assert.deepEqual(fresh.chapter, { id: third, title: 'Slack Tide' });
    assert.equal(await Notification.count({ where: { userId: reader } }), 2);
  });

  test('a Chapter returned to Draft and published again is not announced again', async () => {
    const base = new Date();
    const writer = await account('Writer');
    const reader = await account('Reader');
    const harbour = await book('The Glass Harbour', [writer]);
    const bell = await chapter(harbour, 'The Tide Bell', 1, at(base, -minute));
    await favorite(reader, { bookId: harbour });
    assert.equal((await announcements.announce(base)).length, 1);

    await Chapter.update({ publishedAt: null }, { where: { id: bell } });
    await Chapter.update(
      { publishedAt: at(base, 30_000) },
      { where: { id: bell } }
    );

    assert.deepEqual(await announcements.announce(at(base, minute)), []);
    const [row] = await Notification.findAll();
    assert.equal(row?.chapterCount, 1);
  });

  test("announcing a Chapter leaves its version alone, so a Co-author's save based on it still goes through", async () => {
    const now = new Date();
    const writer = await account('Writer');
    const reader = await account('Reader');
    const harbour = await book('The Glass Harbour', [writer]);
    const bell = await chapter(harbour, 'The Tide Bell', 1, at(now, -minute));
    await favorite(reader, { bookId: harbour });
    const loaded = await Chapter.findByPk(bell);
    assert.ok(loaded);

    await announcements.announce(now);

    const saved = await createSequelizeChapterRepository().update(bell, {
      title: 'The Tide Bell, revised',
      expectedUpdatedAt: loaded.updatedAt.toISOString(),
    });
    assert.equal(saved?.title, 'The Tide Bell, revised');
  });

  test('a Book turning Published with Chapters already out is one New book to its Series and no New chapter', async () => {
    const base = new Date();
    const writer = await account('Writer');
    const seriesFan = await account('SeriesFan');
    const bookFan = await account('BookFan');
    const files = await series('The Nightbus Files', [writer]);
    const returns = await book('The Nightbus Returns', [writer], {
      seriesId: files,
      status: 'draft',
      announced: false,
    });
    const lastStop = await chapter(
      returns,
      'Last Stop',
      1,
      at(base, -2 * minute)
    );
    const nightShift = await chapter(
      returns,
      'Night Shift',
      2,
      at(base, -minute)
    );
    await favorite(seriesFan, { seriesId: files });
    // A Co-author of the Book is never told about it.
    await favorite(writer, { seriesId: files });
    // Kept from when the Book was Published before.
    await favorite(bookFan, { bookId: returns });

    // Out while their Book is a Draft: marked, and nobody told.
    assert.deepEqual(await announcements.announce(base), []);
    assert.deepEqual(await chapterAnnouncedAt(lastStop), base);
    assert.deepEqual(await chapterAnnouncedAt(nightShift), base);

    await Book.update({ status: 'in_progress' }, { where: { id: returns } });
    const published = await Book.findByPk(returns);
    assert.ok(published);
    const release = at(base, minute);
    const news = await announcements.announce(release);

    assert.deepEqual(
      news.map((recipient) => recipient.userId),
      [seriesFan]
    );
    const [only] = news;
    assert.ok(only);
    assert.deepEqual(only.chapters, []);
    assert.deepEqual(only.books, [
      {
        bookId: returns,
        bookTitle: 'The Nightbus Returns',
        seriesId: files,
        seriesTitle: 'The Nightbus Files',
      },
    ]);
    const [notification] = only.notifications;
    assert.ok(notification);
    assert.deepEqual(timeless(notification), {
      id: notification.id,
      kind: 'new_book',
      work: { type: 'book', id: returns, title: 'The Nightbus Returns' },
      series: { id: files, title: 'The Nightbus Files' },
      readAt: null,
    });
    assert.equal(
      await Notification.count({ where: { kind: 'new_chapter' } }),
      0
    );
    const announced = await Book.findByPk(returns);
    assert.deepEqual(announced?.announcedAt, release);
    assert.deepEqual(announced?.updatedAt, published.updatedAt);

    assert.deepEqual(await announcements.announce(at(base, 2 * minute)), []);
  });

  test("a Published Book's first Chapter coming out is a New book to the Series and a New chapter to the Book", async () => {
    const now = new Date();
    const writer = await account('Writer');
    const seriesFan = await account('SeriesFan');
    const bookFan = await account('BookFan');
    const files = await series('The Nightbus Files', [writer]);
    const returns = await book('The Nightbus Returns', [writer], {
      seriesId: files,
      announced: false,
    });
    const lastStop = await chapter(
      returns,
      'Last Stop',
      1,
      at(now, 10 * minute)
    );
    await favorite(seriesFan, { seriesId: files });
    await favorite(bookFan, { bookId: returns });

    // No Chapter out yet: no Release time, so not a New book.
    assert.deepEqual(await announcements.announce(now), []);
    assert.equal((await Book.findByPk(returns))?.announcedAt, null);

    const news = await announcements.announce(at(now, 11 * minute));

    assert.deepEqual(
      news.map((recipient) => ({
        userId: recipient.userId,
        kinds: recipient.notifications.map((notification) => notification.kind),
        books: recipient.books.map((announced) => announced.bookId),
        chapters: recipient.chapters.map((announced) => announced.chapterId),
      })),
      [
        {
          userId: seriesFan,
          kinds: ['new_book'],
          books: [returns],
          chapters: [],
        },
        {
          userId: bookFan,
          kinds: ['new_chapter'],
          books: [],
          chapters: [lastStop],
        },
      ]
    );
  });

  test('a Book released outside any Series is marked announced but raises no Notification', async () => {
    const now = new Date();
    const writer = await account('Writer');
    const standalone = await book('The Loner', [writer], { announced: false });
    await chapter(standalone, 'Chapter One', 1, at(now, -minute));

    assert.deepEqual(await announcements.announce(now), []);

    const released = await Book.findByPk(standalone);
    assert.deepEqual(released?.announcedAt, now);
    assert.equal(await Notification.count(), 0);
  });

  test('a Series Co-author who is not credited on the released Book still gets its New book Notification', async () => {
    const now = new Date();
    const bookWriter = await account('BookWriter');
    const seriesWriter = await account('SeriesWriter');
    const files = await series('The Nightbus Files', [
      bookWriter,
      seriesWriter,
    ]);
    const returns = await book('The Nightbus Returns', [bookWriter], {
      seriesId: files,
      announced: false,
    });
    await chapter(returns, 'Last Stop', 1, at(now, -minute));
    await favorite(seriesWriter, { seriesId: files });

    const [only] = await announcements.announce(now);

    assert.ok(only);
    assert.equal(only.userId, seriesWriter);
    assert.deepEqual(
      only.notifications.map((notification) => notification.kind),
      ['new_book']
    );
  });

  test('only an Account with its switch on and not Blocked has an email address to mail; a Pending one does', async () => {
    const now = new Date();
    const writer = await account('Writer');
    const quiet = await account('Quiet', { emailNotifications: false });
    const blocked = await account('Blocked', { status: 'blocked' });
    const pending = await account('Pending', { status: 'pending' });
    const harbour = await book('The Glass Harbour', [writer]);
    await chapter(harbour, 'The Tide Bell', 1, at(now, -minute));
    for (const userId of [quiet, blocked, pending]) {
      await favorite(userId, { bookId: harbour });
    }

    const news = await announcements.announce(now);

    assert.deepEqual(
      news.map((recipient) => ({
        userId: recipient.userId,
        email: recipient.email,
        notified: recipient.notifications.length,
      })),
      [
        { userId: quiet, email: null, notified: 1 },
        { userId: blocked, email: null, notified: 1 },
        { userId: pending, email: 'pending@example.com', notified: 1 },
      ]
    );
  });
});
