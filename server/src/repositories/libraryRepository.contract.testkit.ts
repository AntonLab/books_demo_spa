import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ForbiddenError,
  NotFoundError,
  StateConflictError,
} from '../types/errors.ts';
import type { LibraryRepository } from './libraryRepository.ts';
import type { Account } from './visibility.ts';

// An id no row in either implementation has.
const MISSING_ID = 999_999;

const FIRST_PAGE = { current: 1, pageSize: 20 };

// Writes whose order matters need distinct timestamps.
const pause = () => new Promise<void>((r) => setTimeout(r, 5));

function reader(id: number): Account {
  return { id, role: 'user' };
}

// What a contract case needs besides the repository: the rows it assumes
// exist. The real side writes them on MySQL, the fake side into its seeds.
export interface LibraryRepositoryContractWorld {
  repository: LibraryRepository;
  // An account exists; answers its id.
  anAccount(): Promise<number>;
  // A Published Book credited to these accounts exists; answers its id.
  aBook(coAuthorIds: [number, ...number[]]): Promise<number>;
  // A Draft Book credited to these accounts exists; answers its id.
  aDraftBook(coAuthorIds: [number, ...number[]]): Promise<number>;
  // Turns a Book into a Draft, or back to Published.
  setDraft(bookId: number, draft: boolean): Promise<void>;
  // A Series credited to these accounts exists; answers its id.
  aSeries(coAuthorIds: [number, ...number[]]): Promise<number>;
  // A Book filed in that Series, credited to these accounts; answers its id.
  aBookInSeries(
    seriesId: number,
    coAuthorIds: [number, ...number[]],
    options?: { draft?: boolean }
  ): Promise<number>;
}

const ids = (page: { items: { id: number }[] }) =>
  page.items.map((item) => item.id);

// Registers the cases every LibraryRepository must pass. Called from the
// repository's MySQL spec and from libraryRepository.fake.spec.ts.
export function libraryRepositoryContract(
  setUp: () => Promise<LibraryRepositoryContractWorld>
): void {
  // An account holding nothing, an author, and `count` published Books by the
  // author.
  async function arrange(count = 1) {
    const world = await setUp();
    const me = await world.anAccount();
    const author = await world.anAccount();
    const books: number[] = [];
    for (let i = 0; i < count; i += 1) books.push(await world.aBook([author]));
    return { ...world, me: reader(me), author: reader(author), books };
  }

  test('contract: set stores a status and list shows the Book with it', async () => {
    const { repository, me, books } = await arrange();
    const entry = await repository.set(books[0]!, 'reading', me);
    assert.equal(entry.bookId, books[0]);
    assert.equal(entry.status, 'reading');
    const page = await repository.list(FIRST_PAGE, me);
    assert.equal(page.total, 1);
    assert.equal(page.items[0]?.id, books[0]);
    assert.equal(page.items[0]?.readingStatus, 'reading');
  });

  test('contract: set replaces the status, and the same status again keeps one row', async () => {
    const { repository, me, books } = await arrange();
    await repository.set(books[0]!, 'reading', me);
    await repository.set(books[0]!, 'read', me);
    await repository.set(books[0]!, 'read', me);
    const page = await repository.list(FIRST_PAGE, me);
    assert.equal(page.total, 1);
    assert.equal(page.items[0]?.readingStatus, 'read');
  });

  test('contract: the newest change lists first, a repeated status included', async () => {
    const { repository, me, books } = await arrange(2);
    const [a, b] = [books[0]!, books[1]!];
    await repository.set(a, 'reading', me);
    await pause();
    await repository.set(b, 'reading', me);
    assert.deepEqual(ids(await repository.list(FIRST_PAGE, me)), [b, a]);
    await pause();
    await repository.set(a, 'reading', me);
    assert.deepEqual(ids(await repository.list(FIRST_PAGE, me)), [a, b]);
  });

  test('contract: set on a missing Book is a NotFoundError', async () => {
    const { repository, me } = await arrange(0);
    await assert.rejects(
      repository.set(MISSING_ID, 'read', me),
      new NotFoundError('Book', MISSING_ID)
    );
  });

  test('contract: a Draft Book is a 404 to a reader and settable by its Co-author', async () => {
    const { repository, aDraftBook, me, author } = await arrange(0);
    const draft = await aDraftBook([author.id]);
    await assert.rejects(
      repository.set(draft, 'reading', me),
      new NotFoundError('Book', draft)
    );
    assert.equal(
      (await repository.set(draft, 'reading', author)).status,
      'reading'
    );
  });

  test('contract: a Moderator can set a status on another Account Draft Book', async () => {
    const { repository, aDraftBook, anAccount, author } = await arrange(0);
    const draft = await aDraftBook([author.id]);
    const moderator: Account = { id: await anAccount(), role: 'admin' };
    assert.equal(
      (await repository.set(draft, 'reading', moderator)).status,
      'reading'
    );
  });

  test('contract: clear removes the status; clearing nothing or a missing Book resolves', async () => {
    const { repository, me, books } = await arrange();
    await repository.set(books[0]!, 'read', me);
    await repository.clear(books[0]!, me);
    assert.equal((await repository.list(FIRST_PAGE, me)).total, 0);
    await repository.clear(books[0]!, me);
    await repository.clear(MISSING_ID, me);
  });

  test('contract: clear refuses the Co-author', async () => {
    const { repository, author, books } = await arrange();
    await assert.rejects(
      repository.clear(books[0]!, author),
      new ForbiddenError('You cannot remove your own work from your Library')
    );
  });

  test('contract: addBook puts a Book in plan_to_read, and again keeps it', async () => {
    const { repository, me, books } = await arrange();
    const expected = { bookId: books[0], status: 'plan_to_read' };
    assert.deepEqual(await repository.addBook(books[0]!, me), expected);
    assert.deepEqual(await repository.addBook(books[0]!, me), expected);
    assert.equal((await repository.list(FIRST_PAGE, me)).total, 1);
  });

  test('contract: addBook turns not_interested into plan_to_read and leaves reading and read', async () => {
    const { repository, me, books } = await arrange(3);
    const [a, b, c] = [books[0]!, books[1]!, books[2]!];
    await repository.set(a, 'not_interested', me);
    await repository.set(b, 'reading', me);
    await repository.set(c, 'read', me);
    const statuses = [];
    for (const id of [a, b, c]) {
      statuses.push((await repository.addBook(id, me)).status);
    }
    assert.deepEqual(statuses, ['plan_to_read', 'reading', 'read']);
  });

  test('contract: addBook never lowers a status set at the same moment', async () => {
    const { repository, me, books } = await arrange();
    await Promise.all([
      repository.set(books[0]!, 'reading', me),
      repository.addBook(books[0]!, me),
    ]);
    const page = await repository.list(FIRST_PAGE, me);
    assert.equal(page.items[0]?.readingStatus, 'reading');
  });

  test('contract: toggleNotInterested never overwrites a status set at the same moment', async () => {
    const { repository, me, books } = await arrange();
    await Promise.allSettled([
      repository.set(books[0]!, 'read', me),
      repository.toggleNotInterested(books[0]!, me),
    ]);
    const page = await repository.list(FIRST_PAGE, me);
    assert.equal(page.items[0]?.readingStatus, 'read');
  });

  test('contract: addBook refuses the Co-author,a missing Book and a Draft', async () => {
    const { repository, aDraftBook, me, author, books } = await arrange();
    await assert.rejects(
      repository.addBook(books[0]!, author),
      new ForbiddenError('You cannot add your own work to your Library')
    );
    await assert.rejects(
      repository.addBook(MISSING_ID, me),
      new NotFoundError('Book', MISSING_ID)
    );
    const draft = await aDraftBook([author.id]);
    await assert.rejects(
      repository.addBook(draft, me),
      new NotFoundError('Book', draft)
    );
  });

  test('contract: toggleNotInterested marks none and plan_to_read, a second press clears it', async () => {
    const { repository, me, books } = await arrange(2);
    const [a, b] = [books[0]!, books[1]!];
    assert.equal(
      (await repository.toggleNotInterested(a, me)).status,
      'not_interested'
    );
    await repository.addBook(b, me);
    assert.equal(
      (await repository.toggleNotInterested(b, me)).status,
      'not_interested'
    );
    assert.deepEqual(await repository.toggleNotInterested(a, me), {
      bookId: a,
      status: null,
    });
    assert.deepEqual(
      ids(
        await repository.list({ ...FIRST_PAGE, status: 'not_interested' }, me)
      ),
      [b]
    );
  });

  test('contract: toggleNotInterested on reading or read is a StateConflictError', async () => {
    const { repository, me, books } = await arrange(2);
    await repository.set(books[0]!, 'reading', me);
    await repository.set(books[1]!, 'read', me);
    for (const id of books) {
      await assert.rejects(
        repository.toggleNotInterested(id, me),
        new StateConflictError('Remove it from your Library first')
      );
    }
    assert.equal((await repository.list(FIRST_PAGE, me)).total, 2);
  });

  test('contract: toggleNotInterested refuses the Co-author, a missing Book and a Draft', async () => {
    const { repository, aDraftBook, me, author, books } = await arrange();
    await assert.rejects(
      repository.toggleNotInterested(books[0]!, author),
      new ForbiddenError('You cannot mark your own work as not interested')
    );
    await assert.rejects(
      repository.toggleNotInterested(MISSING_ID, me),
      new NotFoundError('Book', MISSING_ID)
    );
    const draft = await aDraftBook([author.id]);
    await assert.rejects(
      repository.toggleNotInterested(draft, me),
      new NotFoundError('Book', draft)
    );
  });

  test('contract: the default list leaves out Not interested, and status filters to one', async () => {
    const { repository, me, books } = await arrange(4);
    const statuses = [
      'reading',
      'plan_to_read',
      'read',
      'not_interested',
    ] as const;
    for (const [i, status] of statuses.entries()) {
      await repository.set(books[i]!, status, me);
    }
    const all = await repository.list(FIRST_PAGE, me);
    assert.equal(all.total, 3);
    assert.ok(!ids(all).includes(books[3]!));
    assert.deepEqual(
      ids(
        await repository.list({ ...FIRST_PAGE, status: 'not_interested' }, me)
      ),
      [books[3]]
    );
    assert.deepEqual(
      ids(await repository.list({ ...FIRST_PAGE, status: 'read' }, me)),
      [books[2]]
    );
  });

  test('contract: the list holds only the caller own entries', async () => {
    const { repository, me, author, books } = await arrange();
    await repository.set(books[0]!, 'read', author);
    assert.equal((await repository.list(FIRST_PAGE, me)).total, 0);
  });

  test('contract: paging: two items then one, total 3 each time; past the end is empty', async () => {
    const { repository, me, books } = await arrange(3);
    for (const book of books) await repository.set(book, 'read', me);
    const first = await repository.list({ current: 1, pageSize: 2 }, me);
    const second = await repository.list({ current: 2, pageSize: 2 }, me);
    const beyond = await repository.list({ current: 5, pageSize: 2 }, me);
    assert.deepEqual(
      [first.items.length, second.items.length, beyond.items.length],
      [2, 1, 0]
    );
    assert.deepEqual([first.total, second.total, beyond.total], [3, 3, 3]);
  });

  // `me`, an author crediting a Series, and `count` Published Books in it.
  async function arrangeSeries(count = 3) {
    const world = await arrange(0);
    const seriesId = await world.aSeries([world.author.id]);
    const books: number[] = [];
    for (let i = 0; i < count; i += 1) {
      books.push(await world.aBookInSeries(seriesId, [world.author.id]));
    }
    return { ...world, seriesId, books };
  }

  const statusOf = async (
    repository: LibraryRepository,
    account: Account,
    bookId: number
  ) => {
    const page = await repository.list(
      { ...FIRST_PAGE, pageSize: 100 },
      account
    );
    const hidden = await repository.list(
      { ...FIRST_PAGE, pageSize: 100, status: 'not_interested' },
      account
    );
    return [...page.items, ...hidden.items].find((item) => item.id === bookId)
      ?.readingStatus;
  };

  test('contract: addSeries promotes none and not_interested, leaves reading, skips Drafts', async () => {
    const { repository, aBookInSeries, me, author, seriesId, books } =
      await arrangeSeries();
    const [none, ignored, reading] = [books[0]!, books[1]!, books[2]!];
    const draft = await aBookInSeries(seriesId, [author.id], { draft: true });
    await repository.set(ignored, 'not_interested', me);
    await repository.set(reading, 'reading', me);
    assert.deepEqual(await repository.addSeries(seriesId, me), {
      inLibrary: true,
      notInterested: false,
    });
    assert.equal(await statusOf(repository, me, none), 'plan_to_read');
    assert.equal(await statusOf(repository, me, ignored), 'plan_to_read');
    assert.equal(await statusOf(repository, me, reading), 'reading');
    assert.equal(await statusOf(repository, me, draft), undefined);
  });

  test('contract: toggleSeriesNotInterested sets none only, and a second press clears', async () => {
    const { repository, me, seriesId, books } = await arrangeSeries(2);
    assert.deepEqual(await repository.toggleSeriesNotInterested(seriesId, me), {
      inLibrary: false,
      notInterested: true,
    });
    assert.deepEqual(await repository.toggleSeriesNotInterested(seriesId, me), {
      inLibrary: false,
      notInterested: false,
    });
    for (const id of books) {
      assert.equal(await statusOf(repository, me, id), undefined);
    }
  });

  test('contract: toggleSeriesNotInterested leaves reading and plan_to_read as they are', async () => {
    const { repository, me, seriesId, books } = await arrangeSeries();
    const [planned, reading, none] = [books[0]!, books[1]!, books[2]!];
    await repository.set(planned, 'plan_to_read', me);
    await repository.set(reading, 'reading', me);
    assert.deepEqual(await repository.toggleSeriesNotInterested(seriesId, me), {
      inLibrary: true,
      notInterested: false,
    });
    assert.equal(await statusOf(repository, me, planned), 'plan_to_read');
    assert.equal(await statusOf(repository, me, reading), 'reading');
    assert.equal(await statusOf(repository, me, none), 'not_interested');
  });

  test('contract: toggleSeriesNotInterested with a co-authored Book marks the free Books, and a second press clears them', async () => {
    const { repository, aBookInSeries, anAccount, seriesId, books } =
      await arrangeSeries(2);
    const both = reader(await anAccount());
    const own = await aBookInSeries(seriesId, [both.id]);
    await repository.toggleSeriesNotInterested(seriesId, both);
    for (const id of books) {
      assert.equal(await statusOf(repository, both, id), 'not_interested');
    }
    assert.equal(await statusOf(repository, both, own), undefined);
    await repository.toggleSeriesNotInterested(seriesId, both);
    for (const id of books) {
      assert.equal(await statusOf(repository, both, id), undefined);
    }
  });

  test('contract: clearSeries deletes the entries of every Published Book', async () => {
    const { repository, me, seriesId, books } = await arrangeSeries();
    await repository.set(books[0]!, 'read', me);
    await repository.set(books[1]!, 'not_interested', me);
    assert.deepEqual(await repository.clearSeries(seriesId, me), {
      inLibrary: false,
      notInterested: false,
    });
    for (const id of books) {
      assert.equal(await statusOf(repository, me, id), undefined);
    }
  });

  test('contract: a Series action skips a Book the Account co-authors', async () => {
    const { repository, aBookInSeries, anAccount, seriesId, books } =
      await arrangeSeries(1);
    const both = reader(await anAccount());
    const own = await aBookInSeries(seriesId, [both.id]);
    await repository.addSeries(seriesId, both);
    assert.equal(await statusOf(repository, both, books[0]!), 'plan_to_read');
    assert.equal(await statusOf(repository, both, own), undefined);
  });

  test('contract: a Series with no Published Book writes nothing and answers both flags false', async () => {
    const { repository, aBookInSeries, aSeries, anAccount, author } =
      await arrange(0);
    const seriesId = await aSeries([author.id]);
    const draft = await aBookInSeries(seriesId, [author.id], { draft: true });
    const moderator: Account = { id: await anAccount(), role: 'admin' };
    const none = { inLibrary: false, notInterested: false };
    assert.deepEqual(await repository.addSeries(seriesId, moderator), none);
    assert.deepEqual(
      await repository.toggleSeriesNotInterested(seriesId, moderator),
      none
    );
    assert.deepEqual(await repository.clearSeries(seriesId, moderator), none);
    assert.equal(await statusOf(repository, moderator, draft), undefined);
  });

  test('contract: Series actions refuse a Co-author and a missing Series', async () => {
    const { repository, me, author, seriesId } = await arrangeSeries();
    const actions = [
      ['addSeries', 'You cannot add your own work to your Library'],
      [
        'toggleSeriesNotInterested',
        'You cannot mark your own work as not interested',
      ],
      ['clearSeries', 'You cannot remove your own work from your Library'],
    ] as const;
    for (const [action, message] of actions) {
      await assert.rejects(
        repository[action](seriesId, author),
        new ForbiddenError(message)
      );
      await assert.rejects(
        repository[action](MISSING_ID, me),
        new NotFoundError('Series', MISSING_ID)
      );
    }
  });

  test('contract: addSeries never lowers a status set at the same moment', async () => {
    const { repository, me, seriesId, books } = await arrangeSeries(1);
    await Promise.all([
      repository.set(books[0]!, 'reading', me),
      repository.addSeries(seriesId, me),
    ]);
    assert.equal(await statusOf(repository, me, books[0]!), 'reading');
  });

  test('contract: a Book no longer Published leaves list and total, and returns with its status', async () => {
    const { repository, setDraft, me, books } = await arrange();
    await repository.set(books[0]!, 'reading', me);
    await setDraft(books[0]!, true);
    const hidden = await repository.list(FIRST_PAGE, me);
    assert.deepEqual([hidden.items.length, hidden.total], [0, 0]);
    await setDraft(books[0]!, false);
    assert.equal(
      (await repository.list(FIRST_PAGE, me)).items[0]?.readingStatus,
      'reading'
    );
  });
}
