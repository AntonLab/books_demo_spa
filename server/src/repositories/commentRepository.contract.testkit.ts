import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NotFoundError } from '../types/errors.ts';
import type { CommentRepository } from './commentRepository.ts';

// An id no row in either implementation has.
const MISSING_ID = 999_999;

// What a contract case needs besides the repository: the rows it assumes exist
// before it starts. The real side writes them through the models on MySQL,
// the fake side into the seeds it handed its fake.
export interface CommentRepositoryContractWorld {
  repository: CommentRepository;
  // An account exists; answers its id.
  anAccount(): Promise<number>;
  // A published book exists; answers its id.
  aBook(): Promise<number>;
}

// Registers the cases every CommentRepository must pass, each against a world
// `setUp` builds afresh. Called from commentRepository.spec.ts against MySQL
// and from commentRepository.fake.spec.ts against the fake the route specs use.
//
// Only what the controllers rely on belongs here: which calls answer null or
// false, which error names which resource, and the fields they read — the
// owner and the tombstone above all. Draft books and the tombstone rules are
// the real repository's alone, covered in its own spec.
export function commentRepositoryContract(
  setUp: () => Promise<CommentRepositoryContractWorld>
): void {
  test('contract: a new comment belongs to the actor and is live', async () => {
    const { repository, anAccount, aBook } = await setUp();
    const actorId = await anAccount();
    const bookId = await aBook();

    const created = await repository.create(
      { bookId, parentId: null, text: 'First' },
      actorId
    );
    const reply = await repository.create(
      { bookId, parentId: created.id, text: 'Second' },
      actorId
    );

    assert.equal(created.userId, actorId);
    assert.equal(created.bookId, bookId);
    assert.equal(created.parentId, null);
    assert.equal(created.text, 'First');
    assert.equal(created.tombstone, null);
    assert.equal(reply.parentId, created.id);
    const found = await repository.findById(created.id, null);
    assert.equal(found?.userId, actorId);
    assert.equal(found?.tombstone, null);
  });

  test('contract: a comment naming a missing book, parent or account blames that one', async () => {
    const { repository, anAccount, aBook } = await setUp();
    const actorId = await anAccount();
    const bookId = await aBook();

    await assert.rejects(
      repository.create(
        { bookId: MISSING_ID, parentId: null, text: 'x' },
        actorId
      ),
      new NotFoundError('Book', MISSING_ID)
    );
    await assert.rejects(
      repository.create({ bookId, parentId: MISSING_ID, text: 'x' }, actorId),
      new NotFoundError('Comment', MISSING_ID)
    );
    await assert.rejects(
      repository.create({ bookId, parentId: null, text: 'x' }, MISSING_ID),
      new NotFoundError('User', MISSING_ID)
    );
  });

  test('contract: every lookup and write on a missing comment answers null or false', async () => {
    const { repository } = await setUp();

    assert.equal(await repository.findById(MISSING_ID, null), null);
    assert.equal(await repository.update(MISSING_ID, { text: 'Nobody' }), null);
    assert.equal(await repository.remove(MISSING_ID, 'deleted'), false);
    assert.equal(await repository.restore(MISSING_ID), null);
  });

  test('contract: a book comments are listed oldest first, each naming its author', async () => {
    const { repository, anAccount, aBook } = await setUp();
    const firstId = await anAccount();
    const secondId = await anAccount();
    const bookId = await aBook();
    const otherBookId = await aBook();
    const one = await repository.create(
      { bookId, parentId: null, text: 'One' },
      firstId
    );
    const two = await repository.create(
      { bookId, parentId: one.id, text: 'Two' },
      secondId
    );
    await repository.create(
      { bookId: otherBookId, parentId: null, text: 'Elsewhere' },
      firstId
    );

    const page = await repository.list({ limit: 20, offset: 0, bookId }, null);

    assert.deepEqual(
      page.items.map((item) => [item.id, item.userId, item.author?.id]),
      [
        [one.id, firstId, firstId],
        [two.id, secondId, secondId],
      ]
    );
    assert.equal(page.total, 2);
  });

  test('contract: an update rewrites the text and keeps the owner', async () => {
    const { repository, anAccount, aBook } = await setUp();
    const actorId = await anAccount();
    const created = await repository.create(
      { bookId: await aBook(), parentId: null, text: 'Before' },
      actorId
    );

    const updated = await repository.update(created.id, { text: 'After' });

    assert.equal(updated?.text, 'After');
    assert.equal(updated?.userId, actorId);
    assert.equal((await repository.findById(created.id, null))?.text, 'After');
  });

  test('contract: a removed comment stays, marked with the tombstone it was given', async () => {
    const { repository, anAccount, aBook } = await setUp();
    const actorId = await anAccount();
    const bookId = await aBook();

    for (const kind of ['deleted', 'removed'] as const) {
      const created = await repository.create(
        { bookId, parentId: null, text: kind },
        actorId
      );

      assert.equal(await repository.remove(created.id, kind), true);
      assert.equal(
        (await repository.findById(created.id, null))?.tombstone,
        kind
      );
    }
  });

  test('contract: a restored comment comes back live, with its owner', async () => {
    const { repository, anAccount, aBook } = await setUp();
    const actorId = await anAccount();
    const created = await repository.create(
      { bookId: await aBook(), parentId: null, text: 'Moderated' },
      actorId
    );
    await repository.remove(created.id, 'removed');

    const restored = await repository.restore(created.id);

    assert.equal(restored?.id, created.id);
    assert.equal(restored?.tombstone, null);
    assert.equal(restored?.userId, actorId);
    assert.equal(restored?.text, 'Moderated');
  });
}
