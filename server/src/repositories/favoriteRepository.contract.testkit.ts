import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ConflictError, NotFoundError } from '../types/errors.ts';
import type { Account, FavoriteRepository } from './favoriteRepository.ts';

// An id no row in either implementation has.
const MISSING_ID = 999_999;

const FIRST_PAGE = { limit: 20, offset: 0 };

function reader(id: number): Account {
  return { id, role: 'user' };
}

// What a contract case needs besides the repository: the rows it assumes
// exist. The real side writes them on MySQL, the fake side into its seeds.
export interface FavoriteRepositoryContractWorld {
  repository: FavoriteRepository;
  // An account exists; answers its id.
  anAccount(): Promise<number>;
  // A published book credited to these accounts exists; answers its id.
  aBook(coAuthorIds: [number, ...number[]]): Promise<number>;
  // A series credited to these accounts, holding a published book, exists;
  // answers the series id.
  aSeries(coAuthorIds: [number, ...number[]]): Promise<number>;
}

// Registers the cases every FavoriteRepository must pass. Called from
// favoriteRepository.spec.ts against MySQL and from
// favoriteRepository.fake.spec.ts against the fake the route specs use.
// Draft books and series visibility are the real repository's to prove, in
// its own spec.
export function favoriteRepositoryContract(
  setUp: () => Promise<FavoriteRepositoryContractWorld>
): void {
  const withWorks = async () => {
    const world = await setUp();
    const authorId = await world.anAccount();
    const holderId = await world.anAccount();
    const bookId = await world.aBook([authorId]);
    const seriesId = await world.aSeries([authorId]);
    return { ...world, authorId, holderId, bookId, seriesId };
  };

  test('contract: a favorite belongs to the account and names exactly its one target', async () => {
    const { repository, holderId, bookId, seriesId } = await withWorks();

    const onBook = await repository.create(
      { bookId, seriesId: null },
      reader(holderId)
    );
    const onSeries = await repository.create(
      { bookId: null, seriesId },
      reader(holderId)
    );

    assert.deepEqual(
      [onBook.userId, onBook.bookId, onBook.seriesId],
      [holderId, bookId, null]
    );
    assert.deepEqual(
      [onSeries.userId, onSeries.bookId, onSeries.seriesId],
      [holderId, null, seriesId]
    );
    assert.ok(onBook.createdAt instanceof Date);
  });

  test('contract: a favorite naming a missing book, series or account blames that one', async () => {
    const { repository, holderId, bookId } = await withWorks();

    await assert.rejects(
      repository.create(
        { bookId: MISSING_ID, seriesId: null },
        reader(holderId)
      ),
      new NotFoundError('Book', MISSING_ID)
    );
    await assert.rejects(
      repository.create(
        { bookId: null, seriesId: MISSING_ID },
        reader(holderId)
      ),
      new NotFoundError('Series', MISSING_ID)
    );
    await assert.rejects(
      repository.create({ bookId, seriesId: null }, reader(MISSING_ID)),
      new NotFoundError('User', MISSING_ID)
    );
  });

  test('contract: a second favorite on the same work is a conflict', async () => {
    const { repository, holderId, bookId, seriesId } = await withWorks();
    await repository.create({ bookId, seriesId: null }, reader(holderId));
    await repository.create({ bookId: null, seriesId }, reader(holderId));

    await assert.rejects(
      repository.create({ bookId, seriesId: null }, reader(holderId)),
      new ConflictError('favorite')
    );
    await assert.rejects(
      repository.create({ bookId: null, seriesId }, reader(holderId)),
      new ConflictError('favorite')
    );
  });

  test('contract: two accounts may favorite the same work, a Co-author included', async () => {
    const { repository, authorId, holderId, bookId } = await withWorks();

    await repository.create({ bookId, seriesId: null }, reader(holderId));
    const byCoAuthor = await repository.create(
      { bookId, seriesId: null },
      reader(authorId)
    );

    assert.equal(byCoAuthor.userId, authorId);
  });

  test("contract: each list holds the account's own favorites of its kind, newest first, with the work embedded", async () => {
    const world = await withWorks();
    const { repository, authorId, holderId, bookId, seriesId } = world;
    const secondBookId = await world.aBook([authorId]);
    const first = await repository.create(
      { bookId, seriesId: null },
      reader(holderId)
    );
    const second = await repository.create(
      { bookId: secondBookId, seriesId: null },
      reader(holderId)
    );
    const onSeries = await repository.create(
      { bookId: null, seriesId },
      reader(holderId)
    );
    // Someone else's favorite on the same book stays out of the holder's list.
    await repository.create({ bookId, seriesId: null }, reader(authorId));

    const books = await repository.listBooks(FIRST_PAGE, reader(holderId));
    const series = await repository.listSeries(FIRST_PAGE, reader(holderId));

    assert.equal(books.total, 2);
    assert.deepEqual(
      books.items.map((item) => [item.id, item.book.id]),
      [
        [second.id, secondBookId],
        [first.id, bookId],
      ]
    );
    assert.ok(books.items[0]?.createdAt instanceof Date);
    assert.equal(series.total, 1);
    assert.deepEqual(
      series.items.map((item) => [item.id, item.series.id]),
      [[onSeries.id, seriesId]]
    );
  });

  test('contract: a list pages by limit and offset and counts every row in total', async () => {
    const world = await withWorks();
    const { repository, authorId, holderId, bookId } = world;
    const secondBookId = await world.aBook([authorId]);
    const thirdBookId = await world.aBook([authorId]);
    for (const id of [bookId, secondBookId, thirdBookId]) {
      await repository.create({ bookId: id, seriesId: null }, reader(holderId));
    }

    const page = await repository.listBooks(
      { limit: 1, offset: 1 },
      reader(holderId)
    );

    assert.equal(page.total, 3);
    assert.deepEqual(
      page.items.map((item) => item.book.id),
      [secondBookId]
    );
  });

  test('contract: an account with no favorites gets empty lists', async () => {
    const { repository, holderId } = await withWorks();

    assert.deepEqual(await repository.listBooks(FIRST_PAGE, reader(holderId)), {
      items: [],
      total: 0,
    });
    assert.deepEqual(
      await repository.listSeries(FIRST_PAGE, reader(holderId)),
      { items: [], total: 0 }
    );
  });

  test('contract: removing a favorite answers true once, then false', async () => {
    const { repository, holderId, bookId } = await withWorks();
    const created = await repository.create(
      { bookId, seriesId: null },
      reader(holderId)
    );

    assert.equal(await repository.remove(created.id, holderId), true);
    assert.equal(await repository.remove(created.id, holderId), false);
    assert.equal(await repository.remove(MISSING_ID, holderId), false);
    assert.equal(
      (await repository.listBooks(FIRST_PAGE, reader(holderId))).total,
      0
    );
  });

  // Favorites are private: another account's id must look exactly like a
  // missing one, and the row must survive.
  test("contract: removing another account's favorite answers false and keeps it", async () => {
    const { repository, authorId, holderId, bookId } = await withWorks();
    const created = await repository.create(
      { bookId, seriesId: null },
      reader(holderId)
    );

    assert.equal(await repository.remove(created.id, authorId), false);
    assert.equal(
      (await repository.listBooks(FIRST_PAGE, reader(holderId))).total,
      1
    );
  });
}
