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
import { createCreditedBook } from '../models/creditedBook.testkit.ts';
import { ForbiddenError, NotFoundError } from '../types/errors.ts';
import { createSequelizeCommentRepository } from './commentRepository.ts';
import type { Viewer } from './visibility.ts';

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
      await createCreditedBook(
        { title: 'A Novel', description: 'A novel', tags: [] },
        [ownerId]
      )
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

  test('a reply to a tombstone of either kind is refused', async () => {
    for (const kind of ['deleted', 'removed'] as const) {
      const parent = await repository.create(
        { bookId, parentId: null, text: `Parent (${kind})` },
        ownerId
      );
      await repository.remove(parent.id, kind);

      await assert.rejects(
        repository.create(
          { bookId, parentId: parent.id, text: 'Too late' },
          readerId
        ),
        (error: unknown) =>
          error instanceof ForbiddenError &&
          error.message === 'You cannot reply to a deleted comment'
      );
    }
  });

  test('a reply to a missing parent is a 404 naming the comment', async () => {
    await assert.rejects(
      repository.create(
        { bookId, parentId: 999_999, text: 'To nobody' },
        readerId
      ),
      (error: unknown) =>
        error instanceof NotFoundError &&
        error.message === 'Comment 999999 not found'
    );
  });

  test('remove marks the comment with the given tombstone and keeps its text on the row', async () => {
    const created = await repository.create(
      { bookId, parentId: null, text: 'Gone soon' },
      ownerId
    );

    assert.equal(await repository.remove(created.id, 'removed'), true);

    const row = await Comment.findByPk(created.id);
    assert.equal(row?.tombstone, 'removed');
    assert.equal(row?.text, 'Gone soon');

    const served = await repository.findById(created.id, null);
    assert.equal(served?.tombstone, 'removed');
    assert.equal(served?.text, '');
    assert.equal(served?.userId, null);
  });

  test('remove refuses a comment that is already a tombstone', async () => {
    const created = await repository.create(
      { bookId, parentId: null, text: 'Once' },
      ownerId
    );

    assert.equal(await repository.remove(created.id, 'deleted'), true);
    assert.equal(await repository.remove(created.id, 'removed'), false);
    assert.equal((await Comment.findByPk(created.id))?.tombstone, 'deleted');
  });

  test('remove keeps the replies, so the thread stays readable', async () => {
    const root = await repository.create(
      { bookId, parentId: null, text: 'root' },
      readerId
    );
    const child = await repository.create(
      { bookId, parentId: root.id, text: 'child' },
      ownerId
    );

    await repository.remove(root.id, 'deleted');

    const reloaded = await repository.findById(child.id, null);
    assert.notEqual(reloaded, null);
    assert.equal(reloaded?.tombstone, null);
    assert.equal(reloaded?.parentId, root.id);
  });

  test('remove reports false on a comment that is not there', async () => {
    assert.equal(await repository.remove(999_999, 'deleted'), false);
  });

  test('restore brings back a removed comment, text and owner included', async () => {
    const created = await repository.create(
      { bookId, parentId: null, text: 'Mistaken removal' },
      ownerId
    );
    await repository.remove(created.id, 'removed');

    const restored = await repository.restore(created.id);

    assert.equal(restored?.tombstone, null);
    assert.equal(restored?.text, 'Mistaken removal');
    assert.equal(restored?.userId, ownerId);
  });

  test('restore returns null for a deleted comment, a live one and a missing id', async () => {
    const deleted = await repository.create(
      { bookId, parentId: null, text: 'Mine to delete' },
      ownerId
    );
    await repository.remove(deleted.id, 'deleted');
    const live = await repository.create(
      { bookId, parentId: null, text: 'Still here' },
      ownerId
    );

    assert.equal(await repository.restore(deleted.id), null);
    assert.equal(await repository.restore(live.id), null);
    assert.equal(await repository.restore(999_999), null);
    assert.equal((await Comment.findByPk(deleted.id))?.tombstone, 'deleted');
  });

  test('the list serves a tombstone without its text, author or owner id', async () => {
    const created = await repository.create(
      { bookId, parentId: null, text: 'Hidden' },
      ownerId
    );
    await repository.remove(created.id, 'deleted');

    const { items } = await repository.list(
      { limit: 20, offset: 0, bookId },
      null
    );
    const tombstone = items.find((item) => item.id === created.id);

    assert.equal(tombstone?.tombstone, 'deleted');
    assert.equal(tombstone?.text, '');
    assert.equal(tombstone?.author, null);
    assert.equal(tombstone?.userId, null);
  });

  test('the list serves a tombstone whose owner account is gone, with no author', async () => {
    const leaving = await User.create({
      login: 'GoneAway',
      email: 'gone@example.com',
      password: 'hunter2hunter2',
      firstName: 'Gone',
      lastName: 'Away',
    });
    const created = await repository.create(
      { bookId, parentId: null, text: 'Left behind' },
      leaving.id
    );
    await Comment.update(
      { tombstone: 'deleted' },
      { where: { id: created.id } }
    );
    await User.destroy({ where: { id: leaving.id } });

    const { items } = await repository.list(
      { limit: 20, offset: 0, bookId },
      null
    );
    const tombstone = items.find((item) => item.id === created.id);

    assert.notEqual(tombstone, undefined);
    assert.equal(tombstone?.author, null);
    assert.equal(tombstone?.userId, null);
  });

  test('the list leaves tombstones out of a ?userId= filter', async () => {
    const kept = await repository.create(
      { bookId, parentId: null, text: 'Visible' },
      ownerId
    );
    const gone = await repository.create(
      { bookId, parentId: null, text: 'Removed' },
      ownerId
    );
    await repository.remove(gone.id, 'removed');

    const { items, total } = await repository.list(
      { limit: 20, offset: 0, userId: ownerId },
      null
    );

    assert.deepEqual(
      items.map((item) => item.id),
      [kept.id]
    );
    assert.equal(total, 1);
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
    assert.equal(items[0]?.author?.id, readerId);
    assert.equal(items[0]?.author?.login, reader.login);
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
      { id: ownerId, role: 'author' }
    );
    const asReader = await repository.list(
      { limit: 20, offset: 0, bookId },
      { id: readerId, role: 'user' }
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

  test('update refuses a tombstone and leaves its stored text alone', async () => {
    const comment = await repository.create(
      { bookId, parentId: null, text: 'Before removal' },
      readerId
    );
    // The edit was let in while the comment was live and lost the race to a
    // moderator's removal.
    await repository.remove(comment.id, 'removed');

    assert.equal(
      await repository.update(comment.id, { text: 'Slipped in' }),
      null
    );
    assert.equal((await Comment.findByPk(comment.id))?.text, 'Before removal');
  });

  test('update still answers when the text is resubmitted unchanged', async () => {
    const comment = await repository.create(
      { bookId, parentId: null, text: 'Same words' },
      readerId
    );

    // Within the same second nothing on the row changes at all; the update
    // must still count it as matched rather than report it missing.
    const updated = await repository.update(comment.id, { text: 'Same words' });

    assert.equal(updated?.id, comment.id);
    assert.equal(updated?.text, 'Same words');
  });

  test('nobody may comment on a draft, its co-authors included', async () => {
    const draftId = (
      await createCreditedBook(
        { title: 'Draft', description: 'Private', tags: [], status: 'draft' },
        [ownerId]
      )
    ).id;

    for (const actorId of [ownerId, readerId]) {
      await assert.rejects(
        repository.create(
          { bookId: draftId, parentId: null, text: 'Too early' },
          actorId
        ),
        (error: unknown) =>
          error instanceof ForbiddenError &&
          /draft/i.test((error as Error).message)
      );
    }
  });

  test('returning a book to draft hides its comments from readers and keeps them', async () => {
    const comment = await repository.create(
      { bookId, parentId: null, text: 'Said while it was out' },
      readerId
    );
    await Book.update({ status: 'draft' }, { where: { id: bookId } });

    const owner: Viewer = { id: ownerId, role: 'author' };
    const readerView: Viewer = { id: readerId, role: 'user' };
    const moderator: Viewer = { id: readerId + 1_000, role: 'admin' };
    const total = async (viewer: Viewer): Promise<number> =>
      (await repository.list({ limit: 20, offset: 0 }, viewer)).total;

    // Hidden from its own writer too: they are a reader of this book.
    assert.equal(await total(null), 0);
    assert.equal(await total(readerView), 0);
    assert.equal(await repository.findById(comment.id, readerView), null);
    assert.equal(await total(owner), 1);
    assert.equal(await total(moderator), 1);
    assert.equal(
      (await repository.findById(comment.id, owner))?.text,
      'Said while it was out'
    );

    await Book.update({ status: 'complete' }, { where: { id: bookId } });
    assert.equal(await total(null), 1);
  });
});
