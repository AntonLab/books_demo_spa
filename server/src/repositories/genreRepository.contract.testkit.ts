import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ConflictError } from '../types/errors.ts';
import type { GenreRepository } from './genreRepository.ts';

// An id no row in either implementation has.
const MISSING_ID = 999_999;

// What a contract case needs besides the repository: nothing. A Genre has no
// Owner and no other row has to exist first, unlike a book's series or an
// account's credits.
export interface GenreRepositoryContractWorld {
  repository: GenreRepository;
}

// Registers the cases every GenreRepository must pass, each against a world
// `setUp` builds afresh. Called from genreRepository.spec.ts against MySQL and
// from genreRepository.fake.spec.ts against the fake the route specs use.
//
// Case-insensitive uniqueness and the alphabetical order are in here rather
// than in the MySQL spec alone, because the fake has to match them: MySQL gets
// both from the column's utf8mb4_0900_ai_ci collation, and the fake has to
// lower-case names by hand to agree (M1).
export function genreRepositoryContract(
  setUp: () => Promise<GenreRepositoryContractWorld>
): void {
  test('contract: a new Genre comes back with its id and its name as typed', async () => {
    const { repository } = await setUp();

    const created = await repository.create({ name: 'Hard SF' });

    assert.equal(created.name, 'Hard SF');
    assert.ok(created.id > 0);
  });

  test('contract: the list is alphabetical, whatever the case of each name', async () => {
    const { repository } = await setUp();
    await repository.create({ name: 'gothic' });
    await repository.create({ name: 'Horror' });
    await repository.create({ name: 'Fantasy' });

    assert.deepEqual(
      (await repository.list()).map((genre) => genre.name),
      ['Fantasy', 'gothic', 'Horror']
    );
  });

  test('contract: a name already taken, in any case, is a conflict on the name', async () => {
    const { repository } = await setUp();
    await repository.create({ name: 'Gothic' });

    await assert.rejects(
      repository.create({ name: 'Gothic' }),
      new ConflictError('name')
    );
    await assert.rejects(
      repository.create({ name: 'gothic' }),
      new ConflictError('name')
    );
  });

  test('contract: a rename applies, and another casing of its own name is allowed', async () => {
    const { repository } = await setUp();
    const created = await repository.create({ name: 'Hard SF' });

    assert.equal(
      (await repository.update(created.id, { name: 'hard sf' }))?.name,
      'hard sf'
    );
    assert.deepEqual(
      (await repository.list()).map((genre) => genre.name),
      ['hard sf']
    );
  });

  test('contract: a rename onto another Genre name is a conflict, in any case', async () => {
    const { repository } = await setUp();
    await repository.create({ name: 'Gothic' });
    const other = await repository.create({ name: 'Horror' });

    await assert.rejects(
      repository.update(other.id, { name: 'gothic' }),
      new ConflictError('name')
    );
    // Nothing was written: the list still holds both names as they were.
    assert.deepEqual(
      (await repository.list()).map((genre) => genre.name),
      ['Gothic', 'Horror']
    );
  });

  test('contract: every write on a missing Genre answers null or false', async () => {
    const { repository } = await setUp();

    assert.equal(await repository.update(MISSING_ID, { name: 'Nobody' }), null);
    assert.equal(await repository.remove(MISSING_ID), false);
  });

  test('contract: a removed Genre is gone, and removing it twice answers false', async () => {
    const { repository } = await setUp();
    const created = await repository.create({ name: 'Gothic' });

    assert.equal(await repository.remove(created.id), true);
    assert.deepEqual(await repository.list(), []);
    assert.equal(await repository.remove(created.id), false);
  });
}
