import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NotFoundError } from '../types/errors.ts';
import {
  as,
  MISSING_ID,
  type ReadingListContractWorld,
} from './readingListRepository.contract.testkit.ts';
import {
  book,
  keyOf,
  series,
} from './readingListRepository.items.contract.testkit.ts';

// Registers the copy and "my lists" cases every ReadingListRepository must
// pass. Called from the fake spec and from the MySQL spec.
export function readingListCopyContract(
  setUp: () => Promise<ReadingListContractWorld>
): void {
  const withSource = async () => {
    const world = await setUp();
    const ownerId = await world.anAccount();
    const copierId = await world.anAccount();
    const [b1, b2, s] = [
      await world.aBook(),
      await world.aBook(),
      await world.aSeries(),
    ];
    const source = await world.repository.create(
      {
        title: 'Cold nights',
        description: 'Stories',
        tags: ['winter', 'cosy'],
      },
      as(ownerId)
    );
    const items = [];
    for (const target of [book(b1), series(s), book(b2)]) {
      items.push(
        await world.repository.addItem(source.id, as(ownerId), target)
      );
    }
    return { ...world, ownerId, copierId, source, items, b1, b2, s };
  };

  test("contract: a copy is the caller's own, with the source's fields and shown items in order", async () => {
    const { repository, copierId, ownerId, source, b1, b2, s, setBookDraft } =
      await withSource();
    await setBookDraft(b1, true);
    const copy = await repository.copy(source.id, as(copierId));
    assert.notEqual(copy.id, source.id);
    assert.equal(copy.owner.id, copierId);
    assert.deepEqual(
      [copy.title, copy.description, copy.tags],
      ['Cold nights', 'Stories', ['winter', 'cosy']]
    );
    assert.deepEqual(copy.items.map(keyOf), [`series:${s}`, `book:${b2}`]);
    assert.equal(copy.itemCount, 2);
    assert.equal((await repository.findById(copy.id))?.items.length, 2);
    assert.equal((await repository.findById(source.id))?.owner.id, ownerId);
  });

  test('contract: a hidden item is not copied, even when it is shown again later', async () => {
    const { repository, copierId, source, b1, setBookDraft } =
      await withSource();
    await setBookDraft(b1, true);
    const copy = await repository.copy(source.id, as(copierId));
    await setBookDraft(b1, false);
    assert.equal(
      (await repository.findById(copy.id))?.items.some(
        (i) => keyOf(i) === `book:${b1}`
      ),
      false
    );
  });

  test('contract: the copy and the source do not follow each other', async () => {
    const { repository, ownerId, copierId, source, items, aBook } =
      await withSource();
    const copy = await repository.copy(source.id, as(copierId));
    await repository.update(source.id, as(ownerId), { title: 'Renamed' });
    await repository.removeItem(source.id, items[0]!.id, as(ownerId));
    await repository.addItem(copy.id, as(copierId), book(await aBook()));
    await repository.update(copy.id, as(copierId), { tags: [] });
    const [freshSource, freshCopy] = [
      await repository.findById(source.id),
      await repository.findById(copy.id),
    ];
    assert.deepEqual(
      [freshSource?.title, freshSource?.items.length, freshSource?.tags],
      ['Renamed', 2, ['winter', 'cosy']]
    );
    assert.deepEqual(
      [freshCopy?.title, freshCopy?.items.length, freshCopy?.tags],
      ['Cold nights', 4, []]
    );
  });

  test('contract: copying your own list works, and a missing list is a 404', async () => {
    const { repository, ownerId, source } = await withSource();
    const own = await repository.copy(source.id, as(ownerId));
    assert.equal(own.owner.id, ownerId);
    assert.equal(own.items.length, 3);
    await assert.rejects(
      repository.copy(MISSING_ID, as(ownerId)),
      new NotFoundError('ReadingList', MISSING_ID)
    );
  });

  test("contract: listMine answers the caller's lists, newest first, with the item that holds the work", async () => {
    const { repository, ownerId, copierId, source, items, b2, s, pause } =
      await withSource();
    await pause();
    const second = await repository.create(
      { title: 'Empty', description: '', tags: [] },
      as(ownerId)
    );
    await repository.create(
      { title: 'Theirs', description: '', tags: [] },
      as(copierId)
    );

    const forBook = await repository.listMine({ bookId: b2 }, as(ownerId));
    assert.deepEqual(
      forBook.map((l) => [l.id, l.itemId, l.itemCount]),
      [
        [second.id, null, 0],
        [source.id, items[2]!.id, 3],
      ]
    );
    const forSeries = await repository.listMine({ seriesId: s }, as(ownerId));
    assert.deepEqual(
      forSeries.map((l) => l.itemId),
      [null, items[1]!.id]
    );
    const plain = await repository.listMine({}, as(ownerId));
    assert.deepEqual(
      plain.map((l) => l.itemId),
      [null, null]
    );
    assert.deepEqual(
      (await repository.listMine({ bookId: b2 }, as(copierId))).map(
        (l) => l.title
      ),
      ['Theirs']
    );
  });
}
