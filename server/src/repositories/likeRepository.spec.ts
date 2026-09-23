process.env.NODE_ENV ??= 'test';

import { after, before, beforeEach, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DatabaseError,
  ForeignKeyConstraintError,
  type Sequelize,
} from 'sequelize';
import { createSequelize } from '../db/sequelize.ts';
import { ensureDatabase } from '../db/ensureDatabase.ts';
import { parseConfig } from '../db/config.ts';
import { skipWithoutMysql } from '../db/mysqlProbe.testkit.ts';
import { initModels } from '../models/index.ts';
import { Book } from '../models/Book.ts';
import { Chapter } from '../models/Chapter.ts';
import { Comment } from '../models/Comment.ts';
import { Like } from '../models/Like.ts';
import { Series } from '../models/Series.ts';
import { User } from '../models/User.ts';
import { createCreditedBook } from '../models/creditedBook.testkit.ts';
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
} from '../types/errors.ts';
import { createSequelizeLikeRepository } from './likeRepository.ts';
import { likeRepositoryContract } from './likeRepository.contract.testkit.ts';
import type { Viewer } from './visibility.ts';

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

const skip = await skipWithoutMysql();

const owner = {
  login: 'LikeOwner',
  email: 'likes@example.com',
  password: 'hunter2hunter2',
  firstName: 'Lena',
  lastName: 'Owner',
};

// A second account, because nobody may like their own book or comment: every
// row here is owned by `owner` and liked by `liker`.
const liker = {
  login: 'LikeReader',
  email: 'liker@example.com',
  password: 'hunter2hunter2',
  firstName: 'Liam',
  lastName: 'Reader',
};

describe('likeRepository against real MySQL', { skip }, () => {
  let sequelize: Sequelize;
  let userId: number;
  let likerId: number;
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
    likerId = (await User.create(liker)).id;
    bookId = (
      await createCreditedBook(
        { title: 'A Novel', description: 'A novel', tags: [] },
        [userId]
      )
    ).id;
    commentId = (
      await Comment.create({ userId, bookId, text: 'Loved the ending.' })
    ).id;
  });

  test('a like on a book round-trips with commentId left null', async () => {
    const created = await repository.create(
      { bookId, commentId: null, isLike: true },
      likerId
    );

    const reloaded = await repository.findById(created.id, null);

    assert.equal(reloaded?.bookId, bookId);
    assert.equal(reloaded?.commentId, null);
    assert.equal(reloaded?.isLike, true);
    assert.ok(reloaded?.createdAt instanceof Date);
  });

  test('a dislike on a comment round-trips with bookId left null', async () => {
    const created = await repository.create(
      { bookId: null, commentId, isLike: false },
      likerId
    );

    const reloaded = await repository.findById(created.id, null);

    assert.equal(reloaded?.bookId, null);
    assert.equal(reloaded?.commentId, commentId);
    assert.equal(reloaded?.isLike, false);
  });

  // Enforced by the unique index, not by a findOne before the insert — that
  // would be a check-then-write race and an extra query on every like.
  test('the same user cannot like the same book twice', async () => {
    await repository.create({ bookId, commentId: null, isLike: true }, likerId);

    await assert.rejects(
      repository.create({ bookId, commentId: null, isLike: false }, likerId),
      (error: unknown) =>
        error instanceof ConflictError && error.statusCode === 409
    );
  });

  test('the same user cannot like the same comment twice', async () => {
    await repository.create({ bookId: null, commentId, isLike: true }, likerId);

    await assert.rejects(
      repository.create({ bookId: null, commentId, isLike: true }, likerId),
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

    await repository.create({ bookId, commentId: null, isLike: true }, likerId);
    await repository.create({ bookId: null, commentId, isLike: true }, likerId);
    await repository.create(
      { bookId: null, commentId: second.id, isLike: false },
      likerId
    );

    assert.equal(
      (await repository.list({ limit: 20, offset: 0 }, null)).total,
      3
    );
  });

  test('two users may like the same book', async () => {
    const other = await User.create({
      ...owner,
      login: 'OtherLiker',
      email: 'other@example.com',
    });

    await repository.create({ bookId, commentId: null, isLike: true }, likerId);
    await repository.create(
      { bookId, commentId: null, isLike: true },
      other.id
    );

    assert.equal(
      (await repository.list({ limit: 20, offset: 0, bookId }, null)).total,
      2
    );
  });

  test('a like on an unknown book is a NotFoundError naming the book', async () => {
    await assert.rejects(
      repository.create(
        { bookId: bookId + 10_000, commentId: null, isLike: true },
        likerId
      ),
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
      repository.create(
        { bookId: null, commentId: commentId + 10_000, isLike: true },
        likerId
      ),
      (error: unknown) =>
        error instanceof NotFoundError &&
        /Comment \d+ not found/.test(error.message)
    );
  });

  test('liking your own book is refused', async () => {
    await assert.rejects(
      // The book belongs to `owner`, and `owner` is the actor here.
      repository.create({ bookId, commentId: null, isLike: true }, userId),
      (error: unknown) =>
        error instanceof ForbiddenError && error.statusCode === 403
    );
  });

  test('no co-author may like the book, not only the one who created it', async () => {
    const coAuthorId = (
      await User.create({
        ...owner,
        login: 'LikeCoAuthor',
        email: 'like-coauthor@example.com',
        role: 'author',
      })
    ).id;
    const shared = await createCreditedBook(
      { title: 'Shared Novel', description: 'Co-written', tags: [] },
      [userId, coAuthorId]
    );

    await assert.rejects(
      repository.create(
        { bookId: shared.id, commentId: null, isLike: true },
        coAuthorId
      ),
      (error: unknown) =>
        error instanceof ForbiddenError && error.statusCode === 403
    );
  });

  test('liking your own comment is refused', async () => {
    await assert.rejects(
      repository.create({ bookId: null, commentId, isLike: true }, userId),
      (error: unknown) =>
        error instanceof ForbiddenError && error.statusCode === 403
    );
  });

  test('a like on a tombstone is refused', async () => {
    await Comment.update(
      { tombstone: 'deleted' },
      { where: { id: commentId } }
    );

    await assert.rejects(
      repository.create({ bookId: null, commentId, isLike: true }, likerId),
      (error: unknown) =>
        error instanceof ForbiddenError &&
        error.message === 'You cannot like a deleted comment'
    );
  });

  test('flipping a like on a tombstone is refused, removing it is not', async () => {
    const like = await repository.create(
      { bookId: null, commentId, isLike: true },
      likerId
    );
    await Comment.update(
      { tombstone: 'removed' },
      { where: { id: commentId } }
    );

    await assert.rejects(
      repository.update(like.id, { isLike: false }),
      (error: unknown) =>
        error instanceof ForbiddenError &&
        error.message === 'You cannot change a like on a deleted comment'
    );
    assert.equal(await repository.remove(like.id), true);
  });

  test('a like by an unknown user is a NotFoundError naming the user', async () => {
    await assert.rejects(
      repository.create(
        { bookId, commentId: null, isLike: true },
        userId + 10_000
      ),
      (error: unknown) =>
        error instanceof NotFoundError &&
        /User \d+ not found/.test(error.message)
    );
  });

  // The lookup before the insert is not locked, so a target deleted in between
  // is left to the foreign key — which must still blame the target, not the
  // user. Each hook stands in for that concurrent delete.
  test('a book deleted between the lookup and the insert is still a NotFoundError naming the book', async () => {
    Like.addHook('beforeCreate', 'deleteTarget', async () => {
      await Book.destroy({ where: { id: bookId } });
    });
    try {
      await assert.rejects(
        repository.create({ bookId, commentId: null, isLike: true }, likerId),
        (error: unknown) =>
          error instanceof NotFoundError &&
          error.message === `Book ${bookId} not found`
      );
    } finally {
      Like.removeHook('beforeCreate', 'deleteTarget');
    }
  });

  test('a comment deleted between the lookup and the insert is still a NotFoundError naming the comment', async () => {
    Like.addHook('beforeCreate', 'deleteTarget', async () => {
      await Comment.destroy({ where: { id: commentId } });
    });
    try {
      await assert.rejects(
        repository.create({ bookId: null, commentId, isLike: true }, likerId),
        (error: unknown) =>
          error instanceof NotFoundError &&
          error.message === `Comment ${commentId} not found`
      );
    } finally {
      Like.removeHook('beforeCreate', 'deleteTarget');
    }
  });

  // Only a rejected foreign key means a missing row; anything else the
  // database refuses — here an id no INTEGER UNSIGNED column can hold — is
  // passed on as it is.
  test('a create the database refuses for another reason is not reported as a missing row', async () => {
    await assert.rejects(
      repository.create({ bookId, commentId: null, isLike: true }, -1),
      (error: unknown) =>
        error instanceof DatabaseError &&
        !(error instanceof ForeignKeyConstraintError)
    );
  });

  test('the list filters by commentId and reports the unpaged total', async () => {
    await repository.create({ bookId, commentId: null, isLike: true }, likerId);
    await repository.create({ bookId: null, commentId, isLike: true }, likerId);

    const onComment = await repository.list(
      {
        limit: 20,
        offset: 0,
        commentId,
      },
      null
    );

    assert.equal(onComment.total, 1);
    assert.equal(onComment.items[0]?.commentId, commentId);
  });

  test('the list separates likes from dislikes', async () => {
    const second = await Comment.create({ userId, bookId, text: 'Meh.' });
    await repository.create({ bookId, commentId: null, isLike: true }, likerId);
    await repository.create(
      { bookId: null, commentId: second.id, isLike: false },
      likerId
    );

    const dislikes = await repository.list(
      {
        limit: 20,
        offset: 0,
        isLike: false,
      },
      null
    );

    assert.equal(dislikes.total, 1);
    assert.equal(dislikes.items[0]?.isLike, false);
  });

  test('an update flips a like into a dislike', async () => {
    const created = await repository.create(
      { bookId, commentId: null, isLike: true },
      likerId
    );

    const updated = await repository.update(created.id, { isLike: false });

    assert.equal(updated?.isLike, false);
    assert.equal(updated?.bookId, bookId);
    assert.equal((await repository.findById(created.id, null))?.isLike, false);
  });

  test('updating a like that is not there returns null', async () => {
    assert.equal(await repository.update(999_999, { isLike: false }), null);
  });

  test('remove reports whether a row was actually deleted', async () => {
    const created = await repository.create(
      { bookId, commentId: null, isLike: true },
      likerId
    );

    assert.equal(await repository.remove(created.id), true);
    assert.equal(await repository.remove(created.id), false);
    assert.equal(await repository.findById(created.id, null), null);
  });

  // CASCADE rather than SET NULL: a like whose target was deleted would have
  // both columns null, the one state the model forbids.
  test('deleting a book takes its likes, and the likes on its comments', async () => {
    await repository.create({ bookId, commentId: null, isLike: true }, likerId);
    await repository.create({ bookId: null, commentId, isLike: true }, likerId);

    await Book.destroy({ where: { id: bookId } });

    assert.equal(
      (await repository.list({ limit: 20, offset: 0 }, null)).total,
      0
    );
  });

  test('deleting a comment takes the likes on it', async () => {
    await repository.create({ bookId, commentId: null, isLike: true }, likerId);
    await repository.create({ bookId: null, commentId, isLike: true }, likerId);

    await Comment.destroy({ where: { id: commentId } });

    const left = await repository.list({ limit: 20, offset: 0 }, null);
    assert.equal(left.total, 1);
    assert.equal(left.items[0]?.bookId, bookId);
  });

  test('nobody may like a draft or a comment on one', async () => {
    await Book.update({ status: 'draft' }, { where: { id: bookId } });

    await assert.rejects(
      repository.create({ bookId, commentId: null, isLike: true }, likerId),
      (error: unknown) =>
        error instanceof ForbiddenError && /draft/i.test(error.message)
    );
    await assert.rejects(
      repository.create({ bookId: null, commentId, isLike: true }, likerId),
      (error: unknown) =>
        error instanceof ForbiddenError && /draft/i.test(error.message)
    );
  });

  test('returning a book to draft hides its likes from readers and keeps them', async () => {
    const onBook = await repository.create(
      { bookId, commentId: null, isLike: true },
      likerId
    );
    const onComment = await repository.create(
      { bookId: null, commentId, isLike: true },
      likerId
    );
    await Book.update({ status: 'draft' }, { where: { id: bookId } });

    const readerView: Viewer = { id: likerId, role: 'user' };
    const coAuthor: Viewer = { id: userId, role: 'author' };
    const moderator: Viewer = { id: likerId + 1_000, role: 'superadmin' };
    const total = async (viewer: Viewer): Promise<number> =>
      (await repository.list({ limit: 20, offset: 0 }, viewer)).total;

    assert.equal(await total(null), 0);
    assert.equal(await total(readerView), 0);
    assert.equal(await repository.findById(onBook.id, readerView), null);
    assert.equal(await repository.findById(onComment.id, readerView), null);
    assert.equal(await total(coAuthor), 2);
    assert.equal(await total(moderator), 2);

    await Book.update({ status: 'in_progress' }, { where: { id: bookId } });
    assert.equal(await total(null), 2);
  });

  // --- The contract the route specs' fake is held to, run here for real. ---

  let contractAccounts = 0;
  likeRepositoryContract(async () => ({
    repository,
    async anAccount() {
      contractAccounts += 1;
      const user = await User.create({
        ...liker,
        login: `ContractLiker${contractAccounts}`,
        email: `contract-liker-${contractAccounts}@example.com`,
      });
      return user.id;
    },
    async aBook(coAuthorIds) {
      const book = await createCreditedBook(
        { title: 'Contract Book', description: 'x', tags: [] },
        coAuthorIds
      );
      return book.id;
    },
    async aComment(onBookId, ownerId) {
      const comment = await Comment.create({
        userId: ownerId,
        bookId: onBookId,
        text: 'A comment',
      });
      return comment.id;
    },
  }));
});
