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
  Comment,
  initModels,
  Like,
  Series,
  User,
} from '../models/index.ts';
import { NotFoundError } from '../types/errors.ts';
import { createSequelizeCommentRepository } from './commentRepository.ts';

// A schema of its own rather than the other suites': node:test runs spec files
// in parallel processes, and two suites calling sync({ force: true }) on one
// database would drop each other's tables mid-run.
const TEST_DB_NAME = `${process.env.TEST_DB_NAME ?? 'books_demo_spa_test'}_comments`;

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
  login: 'CommentOwner',
  email: 'comments@example.com',
  password: 'hunter2hunter2',
  firstName: 'Cass',
  lastName: 'Owner',
};

const reader = {
  login: 'CommentReader',
  email: 'reader@example.com',
  password: 'hunter2hunter2',
  firstName: 'Remy',
  lastName: 'Reader',
};

describe('commentRepository against real MySQL', { skip }, () => {
  let sequelize: Sequelize;
  let ownerId: number;
  let readerId: number;
  let bookId: number;
  const repository = createSequelizeCommentRepository();

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
    await Like.destroy({ where: {}, truncate: false });
    await Comment.destroy({ where: {}, truncate: false });
    await Book.destroy({ where: {}, truncate: false });
    await Series.destroy({ where: {}, truncate: false });
    await User.destroy({ where: {}, truncate: false });

    ownerId = (await User.create(owner)).id;
    readerId = (await User.create(reader)).id;
    bookId = (
      await Book.create({
        userId: ownerId,
        title: 'A Novel',
        description: 'A novel',
        tags: [],
      })
    ).id;
  });

  test('create takes the author from the actor, not the input', async () => {
    const comment = await repository.create(
      { bookId, parentId: null, text: 'hello' },
      readerId
    );

    assert.equal(comment.userId, readerId);
    assert.equal(comment.parentId, null);
  });

  test('a create against an unknown book surfaces as NotFoundError', async () => {
    await assert.rejects(
      repository.create(
        { bookId: bookId + 10_000, parentId: null, text: 'orphan' },
        readerId
      ),
      NotFoundError
    );
  });

  test('remove deletes the whole reply subtree', async () => {
    const root = await repository.create(
      { bookId, parentId: null, text: 'root' },
      readerId
    );
    const child = await repository.create(
      { bookId, parentId: root.id, text: 'child' },
      readerId
    );
    const grandchild = await repository.create(
      { bookId, parentId: child.id, text: 'grandchild' },
      readerId
    );

    assert.equal(await repository.remove(root.id), true);

    assert.equal(await repository.findById(root.id), null);
    assert.equal(await repository.findById(child.id), null);
    assert.equal(await repository.findById(grandchild.id), null);
  });

  test('remove leaves an unrelated thread alone', async () => {
    const doomed = await repository.create(
      { bookId, parentId: null, text: 'doomed' },
      readerId
    );
    const survivor = await repository.create(
      { bookId, parentId: null, text: 'survivor' },
      readerId
    );

    await repository.remove(doomed.id);

    assert.notEqual(await repository.findById(survivor.id), null);
  });

  test('deleting a book with a nested thread still works', async () => {
    // The regression the ON DELETE SET NULL foreign key exists to prevent: with
    // CASCADE on the self-reference, this fails with ER_FK_DEPTH_EXCEEDED once
    // the thread is deep enough. See models/index.ts.
    let parentId: number | null = null;
    for (let depth = 0; depth < 20; depth += 1) {
      const comment = await repository.create(
        { bookId, parentId, text: `depth ${depth}` },
        readerId
      );
      parentId = comment.id;
    }

    await Book.destroy({ where: { id: bookId } });

    assert.equal(await Comment.count(), 0);
  });

  test('list embeds the author and reports no likes by default', async () => {
    await repository.create(
      { bookId, parentId: null, text: 'hello' },
      readerId
    );

    const { items, total } = await repository.list(
      { limit: 20, offset: 0, bookId },
      null
    );

    assert.equal(total, 1);
    assert.equal(items[0]?.author.id, readerId);
    assert.equal(items[0]?.author.login, reader.login);
    // The email is the whole reason /api/users is guarded; an embedded author
    // must not carry one.
    assert.equal('email' in (items[0]?.author ?? {}), false);
    assert.equal(items[0]?.likeCount, 0);
    assert.equal(items[0]?.viewerLikeId, null);
  });

  test('list counts likes and reports only the viewer own one', async () => {
    const comment = await repository.create(
      { bookId, parentId: null, text: 'hello' },
      readerId
    );
    const ownersLike = await Like.create({
      userId: ownerId,
      commentId: comment.id,
      isLike: true,
    });

    const anonymous = await repository.list(
      { limit: 20, offset: 0, bookId },
      null
    );
    const asOwner = await repository.list(
      { limit: 20, offset: 0, bookId },
      ownerId
    );
    const asReader = await repository.list(
      { limit: 20, offset: 0, bookId },
      readerId
    );

    assert.equal(anonymous.items[0]?.likeCount, 1);
    assert.equal(anonymous.items[0]?.viewerLikeId, null);
    assert.equal(asOwner.items[0]?.viewerLikeId, ownersLike.id);
    // The reader did not like it, so they get the count without an id of their
    // own — which is what makes the button render as "not liked".
    assert.equal(asReader.items[0]?.likeCount, 1);
    assert.equal(asReader.items[0]?.viewerLikeId, null);
  });

  test('list filters replies by parentId', async () => {
    const root = await repository.create(
      { bookId, parentId: null, text: 'root' },
      readerId
    );
    await repository.create(
      { bookId, parentId: root.id, text: 'reply' },
      ownerId
    );

    const replies = await repository.list(
      { limit: 20, offset: 0, parentId: root.id },
      null
    );

    assert.equal(replies.total, 1);
    assert.equal(replies.items[0]?.text, 'reply');
  });

  test('update rewrites the text and leaves the author alone', async () => {
    const comment = await repository.create(
      { bookId, parentId: null, text: 'first' },
      readerId
    );

    const updated = await repository.update(comment.id, { text: 'second' });

    assert.equal(updated?.text, 'second');
    assert.equal(updated?.userId, readerId);
  });
});
