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
import { Comment } from '../models/Comment.ts';
import { Favorite } from '../models/Favorite.ts';
import { Like } from '../models/Like.ts';
import { ReadingList } from '../models/ReadingList.ts';
import { ReadingListItem } from '../models/ReadingListItem.ts';
import { Series } from '../models/Series.ts';
import { User } from '../models/User.ts';
import {
  createCreditedBook,
  createCreditedSeries,
} from '../models/creditedBook.testkit.ts';
import { createSequelizeAccountRepository } from './accountRepository.ts';
import { accountRepositoryContract } from './accountRepository.contract.testkit.ts';
import { createSequelizeUserRepository } from './userRepository.ts';

// Its own schema, so parallel spec files do not drop each other's tables.
const TEST_DB_NAME = `${process.env.TEST_DB_NAME ?? 'books_demo_spa_test'}_accounts`;

function testDbConfig() {
  const config = parseConfig({
    ...process.env,
    NODE_ENV: 'test',
    DB_NAME: TEST_DB_NAME,
  });
  return config.db;
}

const skip = await skipWithoutMysql();

const pendingInput = {
  login: 'Waiting',
  email: 'waiting@example.com',
  password: 'hunter2hunter2',
  firstName: 'First',
  lastName: 'Waiting',
};
const bookFixture = { title: 'B', description: 'd', tags: [] };
const seriesFixture = { title: 'S', description: 'd', tags: [] };

describe('accountRepository against real MySQL', { skip }, () => {
  let sequelize: Sequelize;
  const repository = createSequelizeAccountRepository();
  const userRepository = createSequelizeUserRepository();

  const active = (login: string) =>
    userRepository.create({
      login,
      email: `${login}@example.com`,
      password: 'hunter2hunter2',
      firstName: 'First',
      lastName: login,
      status: 'active',
    });

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
    await ReadingListItem.destroy({ where: {}, truncate: false });
    await ReadingList.destroy({ where: {}, truncate: false });
    await Favorite.destroy({ where: {}, truncate: false });
    await Like.destroy({ where: {}, truncate: false });
    await Comment.destroy({ where: {}, truncate: false });
    await Book.destroy({ where: {}, truncate: false });
    await Series.destroy({ where: {}, truncate: false });
    await User.destroy({ where: {}, truncate: false });
  });

  accountRepositoryContract(async () => ({ repository }));

  test('an Active Account answers its public fields and no more', async () => {
    const user = await active('Writer');
    await User.update({ about: 'Hello\nthere' }, { where: { id: user.id } });

    const profile = await repository.findProfile(user.id);

    assert.deepEqual(profile, {
      id: user.id,
      firstName: 'First',
      lastName: 'Writer',
      avatarUrl: null,
      about: 'Hello\nthere',
      lastSeenAt: null,
      bookCount: 0,
      seriesCount: 0,
      totals: {
        booksInReadingLists: 0,
        seriesInReadingLists: 0,
        bookLikes: 0,
        seriesLikes: 0,
        commentsOnBooks: 0,
        favorites: 0,
      },
    });
  });

  test('a Blocked or Pending Account answers null like a missing one', async () => {
    const blocked = await active('Banned');
    await User.update({ status: 'blocked' }, { where: { id: blocked.id } });
    const pending = await userRepository.create({ ...pendingInput });

    assert.equal(await repository.findProfile(blocked.id), null);
    assert.equal(await repository.findProfile(pending.id), null);
  });

  test('last online is the stamp, null when hidden or never set', async () => {
    const user = await active('Seen');
    const stamp = new Date('2026-06-01T12:00:00Z');

    assert.equal((await repository.findProfile(user.id))?.lastSeenAt, null);

    await User.update({ lastSeenAt: stamp }, { where: { id: user.id } });
    assert.equal(
      (await repository.findProfile(user.id))?.lastSeenAt?.getTime(),
      stamp.getTime()
    );

    await User.update({ showLastSeen: false }, { where: { id: user.id } });
    assert.equal((await repository.findProfile(user.id))?.lastSeenAt, null);
  });

  test('counts its Published Books and Series with a Published Book, never Drafts', async () => {
    const user = await active('Counter');
    const other = await active('Other');
    const series = await createCreditedSeries(seriesFixture, [user.id]);
    const draftOnly = await createCreditedSeries(seriesFixture, [user.id]);
    const foreign = await createCreditedSeries(seriesFixture, [other.id]);
    await createCreditedBook({ ...bookFixture, seriesId: series.id }, [
      user.id,
    ]);
    await createCreditedBook({ ...bookFixture, status: 'draft' }, [user.id]);
    await createCreditedBook(
      { ...bookFixture, status: 'draft', seriesId: draftOnly.id },
      [user.id]
    );
    await createCreditedBook({ ...bookFixture, seriesId: foreign.id }, [
      other.id,
    ]);

    const profile = await repository.findProfile(user.id);

    assert.equal(profile?.bookCount, 1);
    assert.equal(profile?.seriesCount, 1);
  });

  async function scenario() {
    const a = await active('Author');
    const b = await active('Partner');
    const f1 = await active('FanOne');
    const f2 = await active('FanTwo');
    const s1 = await createCreditedSeries(seriesFixture, [a.id]);
    const draftSeries = await createCreditedSeries(seriesFixture, [a.id]);
    const inSeries = await createCreditedBook(
      { ...bookFixture, seriesId: s1.id },
      [a.id]
    );
    const partnersInS1 = await createCreditedBook(
      { ...bookFixture, seriesId: s1.id },
      [b.id]
    );
    const draftInS1 = await createCreditedBook(
      { ...bookFixture, seriesId: s1.id, status: 'draft' },
      [a.id]
    );
    const solo = await createCreditedBook(bookFixture, [a.id, b.id]);
    const draftSolo = await createCreditedBook(
      { ...bookFixture, status: 'draft' },
      [a.id]
    );
    await createCreditedBook(
      { ...bookFixture, seriesId: draftSeries.id, status: 'draft' },
      [a.id]
    );
    const stranger = await createCreditedBook(bookFixture, [b.id]);
    return {
      a,
      f1,
      f2,
      s1,
      draftSeries,
      inSeries,
      partnersInS1,
      draftInS1,
      solo,
      draftSolo,
      stranger,
    };
  }

  test('Likes count per Published Book, and per Series over every Published Book in it', async () => {
    const w = await scenario();
    for (const [user, book] of [
      [w.f1, w.inSeries],
      [w.f2, w.inSeries],
      [w.f1, w.partnersInS1],
      [w.f1, w.solo],
      [w.f1, w.draftInS1],
      [w.f1, w.stranger],
    ] as const) {
      await Like.create({ userId: user.id, bookId: book.id, isLike: true });
    }
    await Like.create({ userId: w.f2.id, bookId: w.solo.id, isLike: false });

    const totals = (await repository.findProfile(w.a.id))?.totals;

    // inSeries 2 + solo 1; the dislike, the Draft and the stranger's Book do not count.
    assert.equal(totals?.bookLikes, 3);
    // Series S1: inSeries 2 + the partner's Book 1; its Draft does not count.
    assert.equal(totals?.seriesLikes, 3);
  });

  test('Comments count on Published Books, Tombstones and Drafts excluded', async () => {
    const w = await scenario();
    await Comment.create({ userId: w.f1.id, bookId: w.inSeries.id, text: 'a' });
    await Comment.create({ userId: w.f1.id, bookId: w.solo.id, text: 'b' });
    await Comment.create({
      userId: w.f2.id,
      bookId: w.solo.id,
      text: 'c',
      tombstone: 'deleted',
    });
    await Comment.create({
      userId: w.f1.id,
      bookId: w.draftSolo.id,
      text: 'd',
    });
    await Comment.create({
      userId: w.f1.id,
      bookId: w.stranger.id,
      text: 'e',
    });

    assert.equal(
      (await repository.findProfile(w.a.id))?.totals.commentsOnBooks,
      2
    );
  });

  test('Favorites count its Published Books and its Series that have one, nothing else', async () => {
    const w = await scenario();
    await Favorite.create({ userId: w.f1.id, bookId: w.inSeries.id });
    await Favorite.create({ userId: w.f2.id, bookId: w.solo.id });
    await Favorite.create({ userId: w.f1.id, bookId: w.draftSolo.id });
    await Favorite.create({ userId: w.f1.id, bookId: w.stranger.id });
    await Favorite.create({ userId: w.f1.id, seriesId: w.s1.id });
    await Favorite.create({ userId: w.f2.id, seriesId: w.draftSeries.id });

    assert.equal((await repository.findProfile(w.a.id))?.totals.favorites, 3);
  });

  test('Reading list entries count per entry, so one Book in two lists counts twice', async () => {
    const w = await scenario();
    const mine = await ReadingList.create({
      userId: w.f1.id,
      title: 'L',
      description: '',
      tags: [],
    });
    const other = await ReadingList.create({
      userId: w.f2.id,
      title: 'M',
      description: '',
      tags: [],
    });
    const entries = [
      { listId: mine.id, bookId: w.inSeries.id },
      { listId: mine.id, bookId: w.solo.id },
      { listId: mine.id, bookId: w.draftSolo.id },
      { listId: mine.id, seriesId: w.s1.id },
      { listId: mine.id, seriesId: w.draftSeries.id },
      { listId: other.id, bookId: w.inSeries.id },
    ];
    for (const [index, entry] of entries.entries()) {
      await ReadingListItem.create({ ...entry, position: index + 1 });
    }

    const totals = (await repository.findProfile(w.a.id))?.totals;

    assert.equal(totals?.booksInReadingLists, 3);
    assert.equal(totals?.seriesInReadingLists, 1);
  });

  test('an Account with only Drafts has zero totals and counts, and no query fails', async () => {
    const w = await scenario();
    const writer = await active('DraftsOnly');
    const draft = await createCreditedBook(
      { ...bookFixture, status: 'draft' },
      [writer.id]
    );
    await Like.create({ userId: w.f1.id, bookId: draft.id, isLike: true });
    await Comment.create({ userId: w.f1.id, bookId: draft.id, text: 'x' });

    const profile = await repository.findProfile(writer.id);

    assert.equal(profile?.bookCount, 0);
    assert.equal(profile?.seriesCount, 0);
    assert.ok(
      Object.values(profile?.totals ?? { missing: 1 }).every((n) => n === 0)
    );
  });
});
