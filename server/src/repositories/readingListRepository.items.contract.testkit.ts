import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  READING_LIST_MAX_ITEMS,
  type ReadingListEditItem,
  type ReadingListItem,
} from 'shared';
import {
  BadRequestError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
  StateConflictError,
} from '../types/errors.ts';
import {
  as,
  MISSING_ID,
  type ReadingListContractWorld,
} from './readingListRepository.contract.testkit.ts';

const NEW_LIST = { title: 'Cold nights', description: '', tags: [] };
const keyOf = (item: ReadingListItem | ReadingListEditItem): string =>
  item.kind === 'book'
    ? `book:${item.book.id}`
    : item.kind === 'series'
      ? `series:${item.series.id}`
      : 'unavailable';
const book = (bookId: number) => ({ bookId, seriesId: null });
const series = (seriesId: number) => ({ bookId: null, seriesId });

// Registers the item cases every ReadingListRepository must pass. Called from
// the fake spec and from the MySQL spec.
export function readingListItemsContract(
  setUp: () => Promise<ReadingListContractWorld>
): void {
  const withList = async () => {
    const world = await setUp();
    const ownerId = await world.anAccount();
    const otherId = await world.anAccount();
    const { id: listId } = await world.repository.create(NEW_LIST, as(ownerId));
    return { ...world, ownerId, otherId, listId };
  };

  test('contract: items append in order, with the work embedded and counted', async () => {
    const { repository, ownerId, listId, aBook, aSeries } = await withList();
    const [b, s] = [await aBook(), await aSeries()];
    const first = await repository.addItem(listId, as(ownerId), series(s));
    const second = await repository.addItem(listId, as(ownerId), book(b));
    assert.deepEqual([first.kind, second.kind], ['series', 'book']);
    const detail = await repository.findById(listId);
    assert.deepEqual(detail?.items.map(keyOf), [`series:${s}`, `book:${b}`]);
    assert.deepEqual(
      detail?.items.map((i) => i.id),
      [first.id, second.id]
    );
    assert.equal(detail?.itemCount, 2);
  });

  test('contract: a duplicate is a 409; another list, or the same list after removal, accepts it', async () => {
    const { repository, ownerId, listId, aBook } = await withList();
    const b = await aBook();
    const item = await repository.addItem(listId, as(ownerId), book(b));
    await assert.rejects(
      repository.addItem(listId, as(ownerId), book(b)),
      new ConflictError('reading list item')
    );
    const elsewhere = await repository.create(NEW_LIST, as(ownerId));
    await repository.addItem(elsewhere.id, as(ownerId), book(b));
    await repository.removeItem(listId, item.id, as(ownerId));
    await repository.addItem(listId, as(ownerId), book(b));
  });

  test('contract: a missing, Draft or hidden work is a 404; a stranger is a 403', async () => {
    const {
      repository,
      ownerId,
      otherId,
      listId,
      aBook,
      aSeries,
      setBookDraft,
      setSeriesPublic,
    } = await withList();
    const [b, s] = [await aBook(), await aSeries()];
    await setBookDraft(b, true);
    await setSeriesPublic(s, false);
    await assert.rejects(
      repository.addItem(listId, as(ownerId), book(MISSING_ID)),
      new NotFoundError('Book', MISSING_ID)
    );
    await assert.rejects(
      repository.addItem(listId, as(ownerId), book(b)),
      new NotFoundError('Book', b)
    );
    await assert.rejects(
      repository.addItem(listId, as(ownerId), series(s)),
      new NotFoundError('Series', s)
    );
    await assert.rejects(
      repository.addItem(MISSING_ID, as(ownerId), book(b)),
      new NotFoundError('ReadingList', MISSING_ID)
    );
    const fine = await aBook();
    await assert.rejects(
      repository.addItem(listId, as(otherId), book(fine)),
      ForbiddenError
    );
    await assert.rejects(
      repository.addItem(listId, as(otherId, 'admin'), book(fine)),
      ForbiddenError
    );
  });

  test('contract: the 101st item is refused, hidden ones included, until one is removed', async () => {
    const { repository, ownerId, listId, aBook, setBookDraft } =
      await withList();
    const ids: number[] = [];
    for (let i = 0; i < READING_LIST_MAX_ITEMS; i += 1) {
      ids.push(await aBook());
    }
    const rows = [];
    for (const id of ids) {
      rows.push(await repository.addItem(listId, as(ownerId), book(id)));
    }
    await setBookDraft(ids[0]!, true);
    const extra = await aBook();
    await assert.rejects(
      repository.addItem(listId, as(ownerId), book(extra)),
      BadRequestError
    );
    await repository.removeItem(listId, rows[1]!.id, as(ownerId));
    await repository.addItem(listId, as(ownerId), book(extra));
  });

  test('contract: removeItem resolves for an absent item and never touches another list', async () => {
    const { repository, ownerId, otherId, listId, aBook } = await withList();
    const item = await repository.addItem(
      listId,
      as(ownerId),
      book(await aBook())
    );
    const elsewhere = await repository.create(NEW_LIST, as(ownerId));
    await repository.removeItem(elsewhere.id, item.id, as(ownerId));
    await repository.removeItem(listId, MISSING_ID, as(ownerId));
    assert.equal((await repository.findById(listId))?.items.length, 1);
    await assert.rejects(
      repository.removeItem(listId, item.id, as(otherId)),
      ForbiddenError
    );
    await repository.removeItem(listId, item.id, as(ownerId));
    assert.equal((await repository.findById(listId))?.itemCount, 0);
  });

  test('contract: reorderItems sets the order and refuses any other set of ids', async () => {
    const { repository, ownerId, otherId, listId, aBook } = await withList();
    const a = await repository.addItem(
      listId,
      as(ownerId),
      book(await aBook())
    );
    const b = await repository.addItem(
      listId,
      as(ownerId),
      book(await aBook())
    );
    const c = await repository.addItem(
      listId,
      as(ownerId),
      book(await aBook())
    );
    await repository.reorderItems(listId, as(ownerId), [c.id, a.id, b.id]);
    assert.deepEqual(
      (await repository.findById(listId))?.items.map((i) => i.id),
      [c.id, a.id, b.id]
    );
    for (const wrong of [
      [a.id, b.id],
      [a.id, b.id, c.id, MISSING_ID],
      [a.id, a.id, b.id],
    ]) {
      await assert.rejects(
        repository.reorderItems(listId, as(ownerId), wrong),
        StateConflictError
      );
    }
    await assert.rejects(
      repository.reorderItems(listId, as(otherId), [a.id, b.id, c.id]),
      ForbiddenError
    );
    assert.deepEqual(
      (await repository.findById(listId))?.items.map((i) => i.id),
      [c.id, a.id, b.id]
    );
  });

  test('contract: a hidden item leaves the shown items and the count, keeps its place, and returns', async () => {
    const {
      repository,
      ownerId,
      listId,
      aBook,
      aSeries,
      setBookDraft,
      setSeriesPublic,
    } = await withList();
    const [b1, b2, s] = [await aBook(), await aBook(), await aSeries()];
    const items = [];
    for (const target of [book(b1), series(s), book(b2)]) {
      items.push(await repository.addItem(listId, as(ownerId), target));
    }
    await setBookDraft(b1, true);
    await setSeriesPublic(s, false);
    const detail = await repository.findById(listId);
    assert.deepEqual(
      [detail?.items.map(keyOf), detail?.itemCount],
      [[`book:${b2}`], 1]
    );
    assert.equal(
      (
        await repository.listByOwner({
          userId: ownerId,
          current: 1,
          pageSize: 20,
        })
      ).items[0]?.itemCount,
      1
    );
    const editable = await repository.listEditItems(listId, as(ownerId));
    assert.deepEqual(editable.map(keyOf), [
      'unavailable',
      'unavailable',
      `book:${b2}`,
    ]);
    assert.deepEqual(
      editable.map((i) => i.id),
      items.map((i) => i.id)
    );
    assert.deepEqual(Object.keys(editable[0]!).sort(), ['id', 'kind']);
    await repository.reorderItems(listId, as(ownerId), [
      items[2]!.id,
      items[0]!.id,
      items[1]!.id,
    ]);
    await setBookDraft(b1, false);
    await setSeriesPublic(s, true);
    assert.deepEqual((await repository.findById(listId))?.items.map(keyOf), [
      `book:${b2}`,
      `book:${b1}`,
      `series:${s}`,
    ]);
  });

  test("contract: listEditItems is the owner's alone", async () => {
    const { repository, otherId, listId } = await withList();
    await assert.rejects(
      repository.listEditItems(listId, as(otherId)),
      ForbiddenError
    );
    await assert.rejects(
      repository.listEditItems(MISSING_ID, as(otherId)),
      new NotFoundError('ReadingList', MISSING_ID)
    );
  });

  test("contract: an item change moves the list to the top of the owner's lists", async () => {
    const { repository, ownerId, listId, aBook, pause } = await withList();
    await pause();
    await repository.create(NEW_LIST, as(ownerId));
    await pause();
    await repository.addItem(listId, as(ownerId), book(await aBook()));
    const page = await repository.listByOwner({
      userId: ownerId,
      current: 1,
      pageSize: 20,
    });
    assert.equal(page.items[0]?.id, listId);
  });
}
