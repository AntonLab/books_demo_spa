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
import { Like } from '../models/Like.ts';
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
});
