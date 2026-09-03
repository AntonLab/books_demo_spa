process.env.NODE_ENV ??= 'test';

import { after, before, beforeEach, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import mysql from 'mysql2/promise';
import type { Sequelize } from 'sequelize';
import { createSequelize } from '../db/sequelize.ts';
import { ensureDatabase } from '../db/ensureDatabase.ts';
import { parseConfig } from '../db/config.ts';
import {
  Book,
  Chapter,
  Comment,
  Like,
  initModels,
  Series,
  User,
} from '../models/index.ts';
import { ConflictError, NotFoundError } from '../types/errors.ts';
import { createSequelizeLikeRepository } from './likeRepository.ts';

// A schema of its own rather than the other suites': node:test runs spec files
// in parallel processes, and two suites calling sync({ force: true }) on one
// database would drop each other's tables mid-run.
const TEST_DB_NAME = `${process.env.TEST_DB_NAME ?? 'books_demo_spa_test'}_likes`;

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
  login: 'LikeOwner',
  email: 'likes@example.com',
  password: 'hunter2hunter2',
  firstName: 'Lena',
  lastName: 'Owner',
};

describe('likeRepository against real MySQL', { skip }, () => {
  let sequelize: Sequelize;
  let userId: number;
  let bookId: number;
  let commentId: number;
  const repository = createSequelizeLikeRepository();

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
    // them. Likes lead, being the leaf of every chain here.
    await Like.destroy({ where: {}, truncate: false });
    await Comment.destroy({ where: {}, truncate: false });
    await Chapter.destroy({ where: {}, truncate: false });
    await Book.destroy({ where: {}, truncate: false });
    await Series.destroy({ where: {}, truncate: false });
    await User.destroy({ where: {}, truncate: false });

    userId = (await User.create(owner)).id;
    bookId = (await Book.create({ userId, description: 'A novel', tags: [] }))
      .id;
    commentId = (
      await Comment.create({ userId, bookId, text: 'Loved the ending.' })
    ).id;
  });

  test('a like on a book round-trips with commentId left null', async () => {
    const created = await repository.create({
      userId,
      bookId,
      commentId: null,
      isLike: true,
    });

    const reloaded = await repository.findById(created.id);

    assert.equal(reloaded?.bookId, bookId);
    assert.equal(reloaded?.commentId, null);
    assert.equal(reloaded?.isLike, true);
    assert.ok(reloaded?.createdAt instanceof Date);
  });

  test('a dislike on a comment round-trips with bookId left null', async () => {
    const created = await repository.create({
      userId,
      bookId: null,
      commentId,
      isLike: false,
    });

    const reloaded = await repository.findById(created.id);

    assert.equal(reloaded?.bookId, null);
    assert.equal(reloaded?.commentId, commentId);
    assert.equal(reloaded?.isLike, false);
  });

  // Enforced by the unique index, not by a findOne before the insert — that
  // would be a check-then-write race and an extra query on every like.
  test('the same user cannot like the same book twice', async () => {
    await repository.create({ userId, bookId, commentId: null, isLike: true });

    await assert.rejects(
      repository.create({ userId, bookId, commentId: null, isLike: false }),
      (error: unknown) =>
        error instanceof ConflictError && error.statusCode === 409
    );
  });

  test('the same user cannot like the same comment twice', async () => {
    await repository.create({ userId, bookId: null, commentId, isLike: true });

    await assert.rejects(
      repository.create({ userId, bookId: null, commentId, isLike: true }),
      (error: unknown) => error instanceof ConflictError
    );
  });

  // The unique indexes are (userId, bookId) and (userId, commentId), and MySQL
  // treats NULLs in a unique index as distinct — so a user's likes on comments
  // all share bookId IS NULL without colliding.
  test('one user may like a book and several comments at once', async () => {
    const second = await Comment.create({
      userId,
      bookId,
      text: 'And the middle.',
    });

    await repository.create({ userId, bookId, commentId: null, isLike: true });
    await repository.create({ userId, bookId: null, commentId, isLike: true });
    await repository.create({
      userId,
      bookId: null,
      commentId: second.id,
      isLike: false,
    });

    assert.equal((await repository.list({ limit: 20, offset: 0 })).total, 3);
  });

  test('two users may like the same book', async () => {
    const other = await User.create({
      ...owner,
      login: 'OtherLiker',
      email: 'other@example.com',
    });

    await repository.create({ userId, bookId, commentId: null, isLike: true });
    await repository.create({
      userId: other.id,
      bookId,
      commentId: null,
      isLike: true,
    });

    assert.equal(
      (await repository.list({ limit: 20, offset: 0, bookId })).total,
      2
    );
  });

  test('a like on an unknown book is a NotFoundError naming the book', async () => {
    await assert.rejects(
      repository.create({
        userId,
        bookId: bookId + 10_000,
        commentId: null,
        isLike: true,
      }),
      (error: unknown) =>
        error instanceof NotFoundError &&
        /Book \d+ not found/.test(error.message)
    );
  });

  // Three foreign keys means the error has to say which one failed: blaming
  // the user for a bad commentId would send the caller hunting for a user that
  // is sitting right there.
  test('a like on an unknown comment is a NotFoundError naming the comment', async () => {
    await assert.rejects(
      repository.create({
        userId,
        bookId: null,
        commentId: commentId + 10_000,
        isLike: true,
      }),
      (error: unknown) =>
        error instanceof NotFoundError &&
        /Comment \d+ not found/.test(error.message)
    );
  });

  test('a like by an unknown user is a NotFoundError naming the user', async () => {
    await assert.rejects(
      repository.create({
        userId: userId + 10_000,
        bookId,
        commentId: null,
        isLike: true,
      }),
      (error: unknown) =>
        error instanceof NotFoundError &&
        /User \d+ not found/.test(error.message)
    );
  });

  test('the list filters by commentId and reports the unpaged total', async () => {
    await repository.create({ userId, bookId, commentId: null, isLike: true });
    await repository.create({ userId, bookId: null, commentId, isLike: true });

    const onComment = await repository.list({
      limit: 20,
      offset: 0,
      commentId,
    });

    assert.equal(onComment.total, 1);
    assert.equal(onComment.items[0]?.commentId, commentId);
  });

  test('the list separates likes from dislikes', async () => {
    const second = await Comment.create({ userId, bookId, text: 'Meh.' });
    await repository.create({ userId, bookId, commentId: null, isLike: true });
    await repository.create({
      userId,
      bookId: null,
      commentId: second.id,
      isLike: false,
    });

    const dislikes = await repository.list({
      limit: 20,
      offset: 0,
      isLike: false,
    });

    assert.equal(dislikes.total, 1);
    assert.equal(dislikes.items[0]?.isLike, false);
  });

  test('an update flips a like into a dislike', async () => {
    const created = await repository.create({
      userId,
      bookId,
      commentId: null,
      isLike: true,
    });

    const updated = await repository.update(created.id, { isLike: false });

    assert.equal(updated?.isLike, false);
    assert.equal(updated?.bookId, bookId);
    assert.equal((await repository.findById(created.id))?.isLike, false);
  });

  test('updating a like that is not there returns null', async () => {
    assert.equal(await repository.update(999_999, { isLike: false }), null);
  });

  test('remove reports whether a row was actually deleted', async () => {
    const created = await repository.create({
      userId,
      bookId,
      commentId: null,
      isLike: true,
    });

    assert.equal(await repository.remove(created.id), true);
    assert.equal(await repository.remove(created.id), false);
    assert.equal(await repository.findById(created.id), null);
  });

  // CASCADE rather than SET NULL: a like whose target was deleted would have
  // both columns null, the one state the model forbids.
  test('deleting a book takes its likes, and the likes on its comments', async () => {
    await repository.create({ userId, bookId, commentId: null, isLike: true });
    await repository.create({ userId, bookId: null, commentId, isLike: true });

    await Book.destroy({ where: { id: bookId } });

    assert.equal((await repository.list({ limit: 20, offset: 0 })).total, 0);
  });

  test('deleting a comment takes the likes on it', async () => {
    await repository.create({ userId, bookId, commentId: null, isLike: true });
    await repository.create({ userId, bookId: null, commentId, isLike: true });

    await Comment.destroy({ where: { id: commentId } });

    const left = await repository.list({ limit: 20, offset: 0 });
    assert.equal(left.total, 1);
    assert.equal(left.items[0]?.bookId, bookId);
  });
});
