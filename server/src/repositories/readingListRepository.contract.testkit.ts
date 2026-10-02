import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { UserRole } from 'shared';
import { ForbiddenError, NotFoundError } from '../types/errors.ts';
import type {
  Account,
  ReadingListRepository,
} from './readingListRepository.ts';

// An id no row in either implementation has.
export const MISSING_ID = 999_999;

export function as(id: number, role: UserRole = 'user'): Account {
  return { id, role };
}

// What a contract case needs besides the repository: the rows it assumes
// exist. The real side writes them on MySQL, the fake side into its maps.
export interface ReadingListContractWorld {
  repository: ReadingListRepository;
  // An account exists; answers its id.
  anAccount(): Promise<number>;
  // A Published book exists; answers its id.
  aBook(): Promise<number>;
  // A public series holding a Published book exists; answers its id.
  aSeries(): Promise<number>;
  setBookDraft(bookId: number, draft: boolean): Promise<void>;
  setSeriesPublic(seriesId: number, isPublic: boolean): Promise<void>;
  // MySQL waits 5 ms so two writes get different timestamps; the fake does
  // nothing.
  pause(): Promise<void>;
}

const NEW = { title: 'Cold nights', description: 'Stories', tags: ['winter'] };

// Registers the cases every ReadingListRepository must pass. Called from the
// fake spec and from the MySQL spec.
export function readingListContract(
  setUp: () => Promise<ReadingListContractWorld>
): void {
  const withOwner = async () => {
    const world = await setUp();
    const ownerId = await world.anAccount();
    return { ...world, ownerId };
  };
  const withTwoAccounts = async () => {
    const world = await setUp();
    const ownerId = await world.anAccount();
    const otherId = await world.anAccount();
    return { ...world, ownerId, otherId };
  };

  test('contract: a created list belongs to its owner and starts empty', async () => {
    const { repository, ownerId } = await withOwner();
    const list = await repository.create(NEW, as(ownerId));
    assert.equal(list.owner.id, ownerId);
    assert.equal(typeof list.owner.login, 'string');
    assert.deepEqual(
      [list.title, list.description, list.tags, list.itemCount],
      ['Cold nights', 'Stories', ['winter'], 0]
    );
    assert.ok(list.createdAt instanceof Date && list.updatedAt instanceof Date);
  });

  test('contract: a list for an unknown account is a 404 naming the user', async () => {
    const { repository } = await withOwner();
    await assert.rejects(
      repository.create(NEW, as(MISSING_ID)),
      new NotFoundError('User', MISSING_ID)
    );
  });

  test('contract: findById answers the detail, or null for a missing list', async () => {
    const { repository, ownerId } = await withOwner();
    const { id } = await repository.create(NEW, as(ownerId));
    const detail = await repository.findById(id);
    assert.deepEqual(
      [detail?.id, detail?.owner.id, detail?.items],
      [id, ownerId, []]
    );
    assert.equal(await repository.findById(MISSING_ID), null);
  });

  test('contract: update changes only the fields it names', async () => {
    const { repository, ownerId } = await withOwner();
    const { id } = await repository.create(NEW, as(ownerId));
    const updated = await repository.update(id, as(ownerId), {
      title: 'Warm days',
    });
    assert.deepEqual(
      [updated.title, updated.description, updated.tags],
      ['Warm days', 'Stories', ['winter']]
    );
    const cleared = await repository.update(id, as(ownerId), {
      description: '',
      tags: [],
    });
    assert.deepEqual([cleared.description, cleared.tags], ['', []]);
  });

  test('contract: only the owner writes: another account and a Moderator get 403, a missing list 404', async () => {
    const { repository, ownerId, otherId } = await withTwoAccounts();
    const { id } = await repository.create(NEW, as(ownerId));
    for (const intruder of [
      as(otherId),
      as(otherId, 'admin'),
      as(otherId, 'superadmin'),
    ]) {
      await assert.rejects(
        repository.update(id, intruder, { title: 'Mine now' }),
        ForbiddenError
      );
      await assert.rejects(repository.remove(id, intruder), ForbiddenError);
    }
    assert.equal((await repository.findById(id))?.title, 'Cold nights');
    await assert.rejects(
      repository.update(MISSING_ID, as(ownerId), { title: 'x' }),
      new NotFoundError('ReadingList', MISSING_ID)
    );
    await assert.rejects(
      repository.remove(MISSING_ID, as(ownerId)),
      new NotFoundError('ReadingList', MISSING_ID)
    );
  });

  test('contract: remove deletes the list', async () => {
    const { repository, ownerId } = await withOwner();
    const { id } = await repository.create(NEW, as(ownerId));
    await repository.remove(id, as(ownerId));
    assert.equal(await repository.findById(id), null);
  });

  test("contract: listByOwner is the owner's own lists, newest change first, paged", async () => {
    const { repository, ownerId, otherId, pause } = await withTwoAccounts();
    const first = await repository.create({ ...NEW, title: 'A' }, as(ownerId));
    await pause();
    const second = await repository.create({ ...NEW, title: 'B' }, as(ownerId));
    await pause();
    const third = await repository.create({ ...NEW, title: 'C' }, as(ownerId));
    await repository.create({ ...NEW, title: 'Not mine' }, as(otherId));
    await pause();
    await repository.update(first.id, as(ownerId), { title: 'A2' });

    const page1 = await repository.listByOwner({
      userId: ownerId,
      current: 1,
      pageSize: 2,
    });
    assert.deepEqual(
      [page1.total, page1.items.map((l) => l.id)],
      [3, [first.id, third.id]]
    );
    const page2 = await repository.listByOwner({
      userId: ownerId,
      current: 2,
      pageSize: 2,
    });
    assert.deepEqual(
      page2.items.map((l) => l.id),
      [second.id]
    );
    assert.deepEqual(
      await repository.listByOwner({
        userId: MISSING_ID,
        current: 1,
        pageSize: 20,
      }),
      { items: [], total: 0 }
    );
  });
}
