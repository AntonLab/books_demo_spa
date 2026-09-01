process.env.NODE_ENV ??= 'test';

import { after, before, beforeEach, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import mysql from 'mysql2/promise';
import type { Sequelize } from 'sequelize';
import { createSequelize } from '../db/sequelize.ts';
import { ensureDatabase } from '../db/ensureDatabase.ts';
import { parseConfig } from '../db/config.ts';
import { Book, Chapter, initModels, Series, User } from '../models/index.ts';
import { NotFoundError } from '../types/errors.ts';
import { createSequelizeChapterRepository } from './chapterRepository.ts';

// A schema of its own rather than the other suites': node:test runs spec files
// in parallel processes, and two suites calling sync({ force: true }) on one
// database would drop each other's tables mid-run.
const TEST_DB_NAME = `${process.env.TEST_DB_NAME ?? 'books_demo_spa_test'}_chapters`;

function testDbConfig() {
  const config = parseConfig({
    ...process.env,
    NODE_ENV: 'test',
    DB_NAME: TEST_DB_NAME,
  });
  return config.db;
}

async function probe(): Promise<true | string> {
  if (!process.env.DB_USER)
    return 'DB_USER is not set — configure server/.env.local';
  try {
    const db = testDbConfig();
    const connection = await mysql.createConnection({
      host: db.host,
      port: db.port,
      user: db.username,
      password: db.password,
      connectTimeout: 4000,
    });
    await connection.end();
    return true;
  } catch (error) {
    return `MySQL unreachable: ${(error as Error).message}`;
  }
}

const reachable = await probe();
const skip = reachable === true ? false : reachable;

const owner = {
  login: 'ChapterOwner',
  email: 'chapters@example.com',
  password: 'hunter2hunter2',
  firstName: 'Cora',
  lastName: 'Owner',
};

describe('chapterRepository against real MySQL', { skip }, () => {
  let sequelize: Sequelize;
  let bookId: number;
  const repository = createSequelizeChapterRepository();

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
    // Children first: the foreign keys forbid clearing parents out from under
    // them.
    await Chapter.destroy({ where: {}, truncate: false });
    await Book.destroy({ where: {}, truncate: false });
    await Series.destroy({ where: {}, truncate: false });
    await User.destroy({ where: {}, truncate: false });
    const ownerId = (await User.create(owner)).id;
    bookId = (
      await Book.create({
        userId: ownerId,
        description: 'A novel',
        tags: [],
      })
    ).id;
  });

  test('round-trips a chapter and returns its body from findById', async () => {
    const created = await repository.create({
      bookId,
      title: 'Chapter One',
      text: 'It was a dark night.',
    });

    const reloaded = await repository.findById(created.id);

    assert.equal(reloaded?.title, 'Chapter One');
    assert.equal(reloaded?.text, 'It was a dark night.');
    assert.equal(reloaded?.bookId, bookId);
  });

  // The point of MEDIUMTEXT: this body is over 65,535 bytes, so a TEXT column
  // would truncate it (or reject the insert under strict mode).
  test('a body larger than TEXT could hold survives intact', async () => {
    const long = 'a'.repeat(100_000);

    const created = await repository.create({
      bookId,
      title: 'Long',
      text: long,
    });

    assert.equal((await repository.findById(created.id))?.text.length, 100_000);
  });

  test('multi-byte text and titles survive, thanks to utf8mb4', async () => {
    const created = await repository.create({
      bookId,
      title: 'Глава 1 📖',
      text: 'Была тёмная ночь 🌙',
    });

    const reloaded = await repository.findById(created.id);

    assert.equal(reloaded?.title, 'Глава 1 📖');
    assert.equal(reloaded?.text, 'Была тёмная ночь 🌙');
  });

  test('the list omits the body entirely, rather than fetching and dropping it', async () => {
    await repository.create({ bookId, title: 'One', text: 'x'.repeat(50_000) });

    const { items } = await repository.list({ limit: 20, offset: 0 });

    assert.equal(items.length, 1);
    assert.equal(items[0]?.title, 'One');
    assert.ok(!('text' in (items[0] ?? {})));
  });

  test('the list filters by bookId and reports the unpaged total', async () => {
    const otherBook = await Book.create({
      userId: (await User.findOne())!.id,
      description: 'Another novel',
      tags: [],
    });
    await repository.create({ bookId, title: 'Mine', text: 'a' });
    await repository.create({
      bookId: otherBook.id,
      title: 'Theirs',
      text: 'b',
    });

    const mine = await repository.list({ limit: 20, offset: 0, bookId });

    assert.equal(mine.total, 1);
    assert.equal(mine.items[0]?.title, 'Mine');
  });

  test('q matches the title as well as the body', async () => {
    await repository.create({ bookId, title: 'The Storm', text: 'calm seas' });
    await repository.create({ bookId, title: 'Calm', text: 'a storm broke' });

    const found = await repository.list({ limit: 20, offset: 0, q: 'storm' });

    assert.equal(found.total, 2);
  });

  test('q treats LIKE metacharacters literally, so ?q=% matches nothing', async () => {
    await repository.create({ bookId, title: 'Plain', text: 'no wildcards' });

    const found = await repository.list({ limit: 20, offset: 0, q: '%' });

    assert.equal(found.total, 0);
  });

  test('a create against an unknown book is a NotFoundError, not a raw FK error', async () => {
    await assert.rejects(
      repository.create({
        bookId: bookId + 10_000,
        title: 'Orphan',
        text: 'No book',
      }),
      (error: unknown) =>
        error instanceof NotFoundError &&
        /Book \d+ not found/.test(error.message)
    );
  });

  test('an update renames a chapter without disturbing its body', async () => {
    const created = await repository.create({
      bookId,
      title: 'Draft title',
      text: 'The body',
    });

    const updated = await repository.update(created.id, { title: 'Final' });

    assert.equal(updated?.title, 'Final');
    assert.equal(updated?.text, 'The body');
  });

  test('update and remove report a missing chapter rather than throwing', async () => {
    assert.equal(await repository.update(999_999, { title: 'x' }), null);
    assert.equal(await repository.remove(999_999), false);
  });

  // The association's whole purpose: chapters have no life of their own.
  test('deleting a book takes its chapters with it', async () => {
    await repository.create({ bookId, title: 'One', text: 'a' });
    await repository.create({ bookId, title: 'Two', text: 'b' });

    await Book.destroy({ where: { id: bookId } });

    assert.equal((await repository.list({ limit: 20, offset: 0 })).total, 0);
  });
});
