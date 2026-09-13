import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ConflictError, NotFoundError } from '../types/errors.ts';
import type { LikeRepository } from './likeRepository.ts';

// An id no row in either implementation has.
const MISSING_ID = 999_999;

// What a contract case needs besides the repository: the rows it assumes exist
// before it starts. The real side writes them through the models on MySQL,
// the fake side into the seeds it handed its fake.
export interface LikeRepositoryContractWorld {
  repository: LikeRepository;
  // An account exists; answers its id.
  anAccount(): Promise<number>;
  // A published book credited to these accounts exists; answers its id.
  aBook(coAuthorIds: [number, ...number[]]): Promise<number>;
  // A live comment by this account on this book exists; answers its id.
  aComment(bookId: number, ownerId: number): Promise<number>;
}

// Registers the cases every LikeRepository must pass, each against a world
// `setUp` builds afresh. Called from likeRepository.spec.ts against MySQL and
// from likeRepository.fake.spec.ts against the fake the route specs use.
//
// Only what the controllers rely on belongs here: which calls answer null or
// false, which error names which resource, and the fields they read — the
// liker above all. Draft books, tombstones and the self-like ban are the real
// repository's to prove, covered in its own spec.
export function likeRepositoryContract(
  setUp: () => Promise<LikeRepositoryContractWorld>
): void {
  // A world with a book and a comment that neither belongs to the liker.
  const withTargets = async () => {
    const world = await setUp();
    const authorId = await world.anAccount();
    const likerId = await world.anAccount();
    const bookId = await world.aBook([authorId]);
    const commentId = await world.aComment(bookId, authorId);
    return { ...world, likerId, bookId, commentId };
  };

  test('contract: a like belongs to the actor and names exactly its one target', async () => {
    const { repository, likerId, bookId, commentId } = await withTargets();

    const onBook = await repository.create(
      { bookId, commentId: null, isLike: true },
      likerId
    );
    const onComment = await repository.create(
      { bookId: null, commentId, isLike: false },
      likerId
    );

    assert.deepEqual(
      [onBook.userId, onBook.bookId, onBook.commentId, onBook.isLike],
      [likerId, bookId, null, true]
    );
    assert.deepEqual(
      [onComment.userId, onComment.bookId, onComment.commentId],
      [likerId, null, commentId]
    );
    const found = await repository.findById(onBook.id, null);
    assert.equal(found?.userId, likerId);
    assert.ok(found?.createdAt instanceof Date);
  });

  test('contract: a like naming a missing book, comment or account blames that one', async () => {
    const { repository, likerId, bookId } = await withTargets();

    await assert.rejects(
      repository.create(
        { bookId: MISSING_ID, commentId: null, isLike: true },
        likerId
      ),
      new NotFoundError('Book', MISSING_ID)
    );
    await assert.rejects(
      repository.create(
        { bookId: null, commentId: MISSING_ID, isLike: true },
        likerId
      ),
      new NotFoundError('Comment', MISSING_ID)
    );
    await assert.rejects(
      repository.create({ bookId, commentId: null, isLike: true }, MISSING_ID),
      new NotFoundError('User', MISSING_ID)
    );
  });

  test('contract: a second like on the same target is a conflict', async () => {
    const { repository, likerId, bookId } = await withTargets();
    await repository.create({ bookId, commentId: null, isLike: true }, likerId);

    await assert.rejects(
      repository.create({ bookId, commentId: null, isLike: false }, likerId),
      ConflictError
    );
  });

  test('contract: every lookup and write on a missing like answers null or false', async () => {
    const { repository } = await setUp();

    assert.equal(await repository.findById(MISSING_ID, null), null);
    assert.equal(await repository.update(MISSING_ID, { isLike: false }), null);
    assert.equal(await repository.remove(MISSING_ID), false);
  });

  test('contract: an update flips the like and keeps its liker and target', async () => {
    const { repository, likerId, bookId } = await withTargets();
    const created = await repository.create(
      { bookId, commentId: null, isLike: true },
      likerId
    );

    const updated = await repository.update(created.id, { isLike: false });

    assert.deepEqual(
      [updated?.id, updated?.userId, updated?.bookId, updated?.isLike],
      [created.id, likerId, bookId, false]
    );
    assert.equal((await repository.findById(created.id, null))?.isLike, false);
  });

  test('contract: a removed like is gone', async () => {
    const { repository, likerId, commentId } = await withTargets();
    const created = await repository.create(
      { bookId: null, commentId, isLike: true },
      likerId
    );

    assert.equal(await repository.remove(created.id), true);
    assert.equal(await repository.findById(created.id, null), null);
    assert.equal(await repository.remove(created.id), false);
  });
}
