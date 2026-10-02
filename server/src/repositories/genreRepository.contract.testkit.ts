import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  hasSubgenres,
  parentError,
  siblingNameTaken,
  type GenreRepository,
} from './genreRepository.ts';

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
// lower-case names by hand to agree.
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
      siblingNameTaken()
    );
    await assert.rejects(
      repository.create({ name: 'gothic' }),
      siblingNameTaken()
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
      siblingNameTaken()
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

  test('contract: a Subgenre is created under a top-level Genre and answers its parent', async () => {
    const { repository } = await setUp();
    const fantasy = await repository.create({ name: 'Fantasy' });
    const urban = await repository.create({
      name: 'Urban',
      parentId: fantasy.id,
    });
    assert.equal(fantasy.parent, null);
    assert.deepEqual(urban.parent, { id: fantasy.id, name: 'Fantasy' });
    assert.deepEqual(await repository.list(), [
      { id: fantasy.id, name: 'Fantasy', parentId: null },
      { id: urban.id, name: 'Urban', parentId: fantasy.id },
    ]);
  });

  test('contract: siblings collide in any case; other parents and the top level are other scopes', async () => {
    const { repository } = await setUp();
    const a = await repository.create({ name: 'Fantasy' });
    const b = await repository.create({ name: 'Horror' });
    await repository.create({ name: 'Urban', parentId: a.id });
    await assert.rejects(
      repository.create({ name: 'urban', parentId: a.id }),
      siblingNameTaken()
    );
    await repository.create({ name: 'Urban', parentId: b.id });
    await repository.create({ name: 'Urban' });
    await assert.rejects(
      repository.create({ name: 'URBAN' }),
      siblingNameTaken()
    );
  });

  test('contract: a bad parentId is a validation error on parentId', async () => {
    const { repository } = await setUp();
    const top = await repository.create({ name: 'Fantasy' });
    const sub = await repository.create({ name: 'Urban', parentId: top.id });
    await assert.rejects(
      repository.create({ name: 'X', parentId: MISSING_ID }),
      parentError('missing')
    );
    await assert.rejects(
      repository.create({ name: 'X', parentId: sub.id }),
      parentError('notTopLevel')
    );
    await assert.rejects(
      repository.update(top.id, { parentId: top.id }),
      parentError('self')
    );
    await assert.rejects(
      repository.update(sub.id, { parentId: sub.id }),
      parentError('self')
    );
  });

  test('contract: a Subgenre moves, is promoted, and a childless Genre is demoted', async () => {
    const { repository } = await setUp();
    const a = await repository.create({ name: 'Fantasy' });
    const b = await repository.create({ name: 'Horror' });
    const sub = await repository.create({ name: 'Urban', parentId: a.id });
    assert.equal(
      (await repository.update(sub.id, { parentId: b.id }))?.parent?.id,
      b.id
    );
    assert.equal(
      (await repository.update(sub.id, { parentId: null }))?.parent,
      null
    );
    assert.equal(
      (await repository.update(sub.id, { parentId: a.id }))?.parent?.id,
      a.id
    );
    const demoted = await repository.update(b.id, { parentId: a.id });
    assert.equal(demoted?.parent?.id, a.id);
  });

  test('contract: a Genre with Subgenres cannot be demoted', async () => {
    const { repository } = await setUp();
    const a = await repository.create({ name: 'Fantasy' });
    const b = await repository.create({ name: 'Horror' });
    await repository.create({ name: 'Urban', parentId: a.id });
    await assert.rejects(
      repository.update(a.id, { parentId: b.id }),
      parentError('hasSubgenres')
    );
  });

  test('contract: a move or promotion onto a sibling name is a conflict and changes nothing', async () => {
    const { repository } = await setUp();
    const a = await repository.create({ name: 'Fantasy' });
    const b = await repository.create({ name: 'Horror' });
    const sub = await repository.create({ name: 'Gothic', parentId: a.id });
    await repository.create({ name: 'gothic', parentId: b.id });
    await repository.create({ name: 'Gothic' });
    await assert.rejects(
      repository.update(sub.id, { parentId: b.id }),
      siblingNameTaken()
    );
    await assert.rejects(
      repository.update(sub.id, { parentId: null }),
      siblingNameTaken()
    );
    await assert.rejects(
      repository.update(sub.id, { name: 'GOTHIC', parentId: b.id }),
      siblingNameTaken()
    );
    const kept = (await repository.list()).find((g) => g.id === sub.id);
    assert.deepEqual(kept, { id: sub.id, name: 'Gothic', parentId: a.id });
  });

  test('contract: a Genre keeps its own name in another case beside an equal name elsewhere', async () => {
    const { repository } = await setUp();
    const a = await repository.create({ name: 'Fantasy' });
    const sub = await repository.create({ name: 'Urban', parentId: a.id });
    await repository.create({ name: 'urban' });
    assert.equal(
      (await repository.update(sub.id, { name: 'URBAN' }))?.name,
      'URBAN'
    );
  });

  test('contract: a Genre with a Subgenre cannot be deleted until the Subgenre is gone', async () => {
    const { repository } = await setUp();
    const a = await repository.create({ name: 'Fantasy' });
    const sub = await repository.create({ name: 'Urban', parentId: a.id });
    await assert.rejects(repository.remove(a.id), hasSubgenres());
    assert.equal(await repository.remove(sub.id), true);
    assert.equal(await repository.remove(a.id), true);
  });
}
