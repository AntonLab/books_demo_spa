import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NotFoundError } from '../types/errors.ts';
import type { Actor } from './notificationRepository.ts';
import type { SeriesRepository } from './seriesRepository.ts';
import type { Viewer } from './visibility.ts';

// An id no row in either implementation has.
const MISSING_ID = 999_999;

// What a contract case needs besides the repository: the rows it assumes exist
// before it starts. The real side writes them through the models on MySQL,
// the fake side into the seeds it handed its fake.
export interface SeriesRepositoryContractWorld {
  repository: SeriesRepository;
  // An account holding the Author Role exists; answers its id.
  anAuthor(): Promise<number>;
  // A book filed in this series, or in none, exists; answers its id.
  aBookIn(seriesId: number | null): Promise<number>;
}

// Registers the cases every SeriesRepository must pass, each against a world
// `setUp` builds afresh. Called from seriesRepository.spec.ts against MySQL and
// from seriesRepository.fake.spec.ts against the fake the route specs use.
//
// Only what the controllers rely on belongs here: which calls answer null or
// false, which error names which resource, the credit order they hand on, and
// the fields they read. Visibility, the credit rules and notifications are the
// real repository's alone, covered in its own spec.
export function seriesRepositoryContract(
  setUp: () => Promise<SeriesRepositoryContractWorld>
): void {
  const asActor = (id: number): Actor => ({ id, role: 'author' });
  // Sees every series, whatever holds it.
  const asModerator: Viewer = { id: MISSING_ID, role: 'superadmin' };

  const aSeries = (repository: SeriesRepository, userId: number) =>
    repository.create({
      userId,
      title: 'Contract Series',
      description: 'A series',
      tags: ['saga'],
    });

  test('contract: a new series is credited to its creator alone', async () => {
    const { repository, anAuthor } = await setUp();
    const authorId = await anAuthor();

    const created = await aSeries(repository, authorId);

    assert.equal(created.title, 'Contract Series');
    assert.deepEqual(created.tags, ['saga']);
    assert.deepEqual(
      created.authors.map((author) => author.id),
      [authorId]
    );
    assert.deepEqual(await repository.findCoAuthorIds(created.id), [authorId]);
  });

  test('contract: a series created for a missing account blames the user', async () => {
    const { repository } = await setUp();

    await assert.rejects(
      aSeries(repository, MISSING_ID),
      new NotFoundError('User', MISSING_ID)
    );
  });

  test('contract: every lookup and write on a missing series answers null or false', async () => {
    const { repository, anAuthor, aBookIn } = await setUp();
    const authorId = await anAuthor();
    const bookId = await aBookIn(null);
    const actor = asActor(authorId);

    assert.equal(await repository.findById(MISSING_ID, asModerator), null);
    assert.equal(
      await repository.update(MISSING_ID, { title: 'Nobody' }),
      null
    );
    assert.equal(await repository.remove(MISSING_ID, actor), false);
    assert.equal(
      await repository.addCoAuthor(MISSING_ID, authorId, actor),
      null
    );
    assert.equal(
      await repository.removeCoAuthor(MISSING_ID, authorId, actor),
      null
    );
    assert.equal(await repository.removeBook(MISSING_ID, bookId), false);
    assert.equal(await repository.findCoAuthorIds(MISSING_ID), null);
  });

  test('contract: findCoAuthorIds lists the co-authors in credit order', async () => {
    const { repository, anAuthor } = await setUp();
    const creatorId = await anAuthor();
    const earlierId = await anAuthor();
    const laterId = await anAuthor();
    const created = await aSeries(repository, creatorId);

    // Against the order the accounts were made in, so an order by id fails.
    const added = await repository.addCoAuthor(
      created.id,
      laterId,
      asActor(creatorId)
    );
    await repository.addCoAuthor(created.id, earlierId, asActor(creatorId));

    assert.deepEqual(
      added?.authors.map((author) => author.id),
      [creatorId, laterId]
    );
    assert.deepEqual(await repository.findCoAuthorIds(created.id), [
      creatorId,
      laterId,
      earlierId,
    ]);

    const removed = await repository.removeCoAuthor(
      created.id,
      laterId,
      asActor(creatorId)
    );
    assert.deepEqual(
      removed?.authors.map((author) => author.id),
      [creatorId, earlierId]
    );
  });

  test('contract: crediting a missing account blames the user', async () => {
    const { repository, anAuthor } = await setUp();
    const authorId = await anAuthor();
    const created = await aSeries(repository, authorId);

    await assert.rejects(
      repository.addCoAuthor(created.id, MISSING_ID, asActor(authorId)),
      new NotFoundError('User', MISSING_ID)
    );
  });

  test('contract: an update applies the fields given and leaves the rest', async () => {
    const { repository, anAuthor } = await setUp();
    const authorId = await anAuthor();
    const created = await aSeries(repository, authorId);

    const updated = await repository.update(created.id, { title: 'Renamed' });

    assert.equal(updated?.title, 'Renamed');
    assert.equal(updated?.description, 'A series');
    assert.deepEqual(updated?.tags, ['saga']);
    assert.deepEqual(
      updated?.authors.map((author) => author.id),
      [authorId]
    );
    assert.equal(
      (await repository.findById(created.id, asModerator))?.title,
      'Renamed'
    );
  });

  test('contract: removeBook unlinks a book filed in the series, and blames the book when it is not', async () => {
    const { repository, anAuthor, aBookIn } = await setUp();
    const authorId = await anAuthor();
    const created = await aSeries(repository, authorId);
    const filed = await aBookIn(created.id);
    const standalone = await aBookIn(null);

    assert.equal(await repository.removeBook(created.id, filed), true);
    // Out of the series now, so there is nothing left to unlink.
    await assert.rejects(
      repository.removeBook(created.id, filed),
      new NotFoundError('Book', filed)
    );
    await assert.rejects(
      repository.removeBook(created.id, standalone),
      new NotFoundError('Book', standalone)
    );
  });

  test('contract: a removed series is gone, credits and all', async () => {
    const { repository, anAuthor } = await setUp();
    const authorId = await anAuthor();
    const created = await aSeries(repository, authorId);

    assert.equal(await repository.remove(created.id, asActor(authorId)), true);
    assert.equal(await repository.findById(created.id, asModerator), null);
    assert.equal(await repository.findCoAuthorIds(created.id), null);
    assert.equal(await repository.remove(created.id, asActor(authorId)), false);
  });
}
