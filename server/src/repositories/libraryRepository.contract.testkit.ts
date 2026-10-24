import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ForbiddenError,
  NotFoundError,
  StateConflictError,
} from '../types/errors.ts';
import type { ReadingStatus } from 'shared';
import {
  ADD_OWN_WORK,
  NOT_INTERESTED_OWN_WORK,
  PROGRESS_OWN_WORK,
  REMOVE_FROM_LIBRARY_FIRST,
} from './libraryMessages.ts';
import type { LibraryRepository } from './libraryRepository.ts';
import type { Account } from './visibility.ts';

// An id no row in either implementation has.
const MISSING_ID = 999_999;

const FIRST_PAGE = { current: 1, pageSize: 20 };

// Writes whose order matters need distinct timestamps.
const pause = (ms = 5) => new Promise<void>((r) => setTimeout(r, ms));

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
  // A Chapter of the Book exists, Published or not; positions ascend in call
  // order unless `position` is given, and `publishedAt` (a Published one only)
  // defaults to a moment in the past. Answers its id.
  aChapter(
    bookId: number,
    options: { published: boolean; publishedAt?: Date; position?: number }
  ): Promise<number>;
  // Turns a Book into a Complete one.
  setComplete(bookId: number): Promise<void>;
  // A Series credited to these accounts exists; answers its id.
  aSeries(coAuthorIds: [number, ...number[]]): Promise<number>;
  // A Book filed in that Series, credited to these accounts; answers its id.
  aBookInSeries(
    seriesId: number,
    coAuthorIds: [number, ...number[]],
    options?: { draft?: boolean }
  ): Promise<number>;
  // The account holds the Book with this status, written straight to the
  // store; again for a held Book replaces the status and refreshes updatedAt.
  seedStatus(
    accountId: number,
    bookId: number,
    status: ReadingStatus
  ): Promise<void>;
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

  test('contract: list shows a held Book with its status', async () => {
    const { repository, seedStatus, me, books } = await arrange();
    await seedStatus(me.id, books[0]!, 'reading');
    const page = await repository.list(FIRST_PAGE, me);
    assert.equal(page.total, 1);
    assert.equal(page.items[0]?.id, books[0]);
    assert.equal(page.items[0]?.readingStatus, 'reading');
  });

  test('contract: the newest change lists first, a repeated status included', async () => {
    const { repository, seedStatus, me, books } = await arrange(2);
    const [a, b] = [books[0]!, books[1]!];
    await seedStatus(me.id, a, 'reading');
    await pause();
    await seedStatus(me.id, b, 'reading');
    assert.deepEqual(ids(await repository.list(FIRST_PAGE, me)), [b, a]);
    await pause();
    await seedStatus(me.id, a, 'reading');
    assert.deepEqual(ids(await repository.list(FIRST_PAGE, me)), [a, b]);
  });

  test('contract: clear removes the status; clearing nothing or a missing Book resolves', async () => {
    const { repository, seedStatus, me, books } = await arrange();
    await seedStatus(me.id, books[0]!, 'read');
    await repository.clear(books[0]!, me);
    assert.equal((await repository.list(FIRST_PAGE, me)).total, 0);
    await repository.clear(books[0]!, me);
    await repository.clear(MISSING_ID, me);
  });

  test('contract: clear deletes a Co-author leftover entry, and resolves with none', async () => {
    const { repository, seedStatus, author, books } = await arrange();
    await repository.clear(books[0]!, author);
    await seedStatus(author.id, books[0]!, 'read');
    assert.equal((await repository.list(FIRST_PAGE, author)).total, 1);
    await repository.clear(books[0]!, author);
    assert.equal((await repository.list(FIRST_PAGE, author)).total, 0);
  });

  test('contract: addBook puts a Book in plan_to_read, and again keeps it', async () => {
    const { repository, me, books } = await arrange();
    const expected = { bookId: books[0], status: 'plan_to_read' };
    assert.deepEqual(await repository.addBook(books[0]!, me), expected);
    assert.deepEqual(await repository.addBook(books[0]!, me), expected);
    assert.equal((await repository.list(FIRST_PAGE, me)).total, 1);
  });

  test('contract: addBook turns not_interested into plan_to_read and leaves reading and read', async () => {
    const { repository, seedStatus, me, books } = await arrange(3);
    const [a, b, c] = [books[0]!, books[1]!, books[2]!];
    await seedStatus(me.id, a, 'not_interested');
    await seedStatus(me.id, b, 'reading');
    await seedStatus(me.id, c, 'read');
    const statuses = [];
    for (const id of [a, b, c]) {
      statuses.push((await repository.addBook(id, me)).status);
    }
    assert.deepEqual(statuses, ['plan_to_read', 'reading', 'read']);
  });

  test('contract: addBook never lowers a status set at the same moment', async () => {
    const { repository, seedStatus, me, books } = await arrange();
    await Promise.all([
      seedStatus(me.id, books[0]!, 'reading'),
      repository.addBook(books[0]!, me),
    ]);
    const page = await repository.list(FIRST_PAGE, me);
    assert.equal(page.items[0]?.readingStatus, 'reading');
  });

  test('contract: toggleNotInterested never overwrites a status set at the same moment', async () => {
    // One round per Book, the status write starting a millisecond later each
    // time, so one round lands it between the toggle's statements.
    const { repository, seedStatus, me, books } = await arrange(6);
    for (const [delay, book] of books.entries()) {
      await Promise.allSettled([
        pause(delay).then(() => seedStatus(me.id, book, 'read')),
        repository.toggleNotInterested(book, me),
      ]);
    }
    const page = await repository.list(FIRST_PAGE, me);
    assert.deepEqual(
      page.items.map((item) => item.readingStatus),
      books.map(() => 'read')
    );
  });

  test('contract: addBook refuses the Co-author, a missing Book and a Draft', async () => {
    const { repository, aDraftBook, me, author, books } = await arrange();
    await assert.rejects(
      repository.addBook(books[0]!, author),
      new ForbiddenError(ADD_OWN_WORK)
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
    const { repository, seedStatus, me, books } = await arrange(2);
    await seedStatus(me.id, books[0]!, 'reading');
    await seedStatus(me.id, books[1]!, 'read');
    for (const id of books) {
      await assert.rejects(
        repository.toggleNotInterested(id, me),
        new StateConflictError(REMOVE_FROM_LIBRARY_FIRST)
      );
    }
    assert.equal((await repository.list(FIRST_PAGE, me)).total, 2);
  });

  test('contract: toggleNotInterested refuses the Co-author, a missing Book and a Draft', async () => {
    const { repository, aDraftBook, me, author, books } = await arrange();
    await assert.rejects(
      repository.toggleNotInterested(books[0]!, author),
      new ForbiddenError(NOT_INTERESTED_OWN_WORK)
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
    const { repository, seedStatus, me, books } = await arrange(4);
    const statuses = [
      'reading',
      'plan_to_read',
      'read',
      'not_interested',
    ] as const;
    for (const [i, status] of statuses.entries()) {
      await seedStatus(me.id, books[i]!, status);
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
    const { repository, seedStatus, me, author, books } = await arrange();
    await seedStatus(author.id, books[0]!, 'read');
    assert.equal((await repository.list(FIRST_PAGE, me)).total, 0);
  });

  test('contract: paging: two items then one, total 3 each time; past the end is empty', async () => {
    const { repository, seedStatus, me, books } = await arrange(3);
    for (const book of books) await seedStatus(me.id, book, 'read');
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
    const {
      repository,
      seedStatus,
      aBookInSeries,
      me,
      author,
      seriesId,
      books,
    } = await arrangeSeries();
    const [none, ignored, reading] = [books[0]!, books[1]!, books[2]!];
    const draft = await aBookInSeries(seriesId, [author.id], { draft: true });
    await seedStatus(me.id, ignored, 'not_interested');
    await seedStatus(me.id, reading, 'reading');
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
    const { repository, seedStatus, me, seriesId, books } =
      await arrangeSeries();
    const [planned, reading, none] = [books[0]!, books[1]!, books[2]!];
    await seedStatus(me.id, planned, 'plan_to_read');
    await seedStatus(me.id, reading, 'reading');
    assert.deepEqual(await repository.toggleSeriesNotInterested(seriesId, me), {
      inLibrary: true,
      notInterested: false,
    });
    assert.equal(await statusOf(repository, me, planned), 'plan_to_read');
    assert.equal(await statusOf(repository, me, reading), 'reading');
    assert.equal(await statusOf(repository, me, none), 'not_interested');
  });

  test('contract: toggleSeriesNotInterested with some Books already marked marks the rest; only all marked clears', async () => {
    const { repository, seedStatus, me, seriesId, books } =
      await arrangeSeries(2);
    await seedStatus(me.id, books[0]!, 'not_interested');
    assert.deepEqual(await repository.toggleSeriesNotInterested(seriesId, me), {
      inLibrary: false,
      notInterested: true,
    });
    for (const id of books) {
      assert.equal(await statusOf(repository, me, id), 'not_interested');
    }
    assert.deepEqual(await repository.toggleSeriesNotInterested(seriesId, me), {
      inLibrary: false,
      notInterested: false,
    });
    for (const id of books) {
      assert.equal(await statusOf(repository, me, id), undefined);
    }
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
    const { repository, seedStatus, me, seriesId, books } =
      await arrangeSeries();
    await seedStatus(me.id, books[0]!, 'read');
    await seedStatus(me.id, books[1]!, 'not_interested');
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

  test('contract: clearSeries deletes a leftover entry of a Book the Account co-authors', async () => {
    const {
      repository,
      seedStatus,
      aBookInSeries,
      anAccount,
      seriesId,
      books,
    } = await arrangeSeries(1);
    const both = reader(await anAccount());
    const own = await aBookInSeries(seriesId, [both.id]);
    await seedStatus(both.id, books[0]!, 'reading');
    await seedStatus(both.id, own, 'read');
    await repository.clearSeries(seriesId, both);
    assert.equal(await statusOf(repository, both, books[0]!), undefined);
    assert.equal(await statusOf(repository, both, own), undefined);
  });

  test('contract: a Co-author of the Series may clearSeries, deleting a leftover entry', async () => {
    const { repository, seedStatus, author, seriesId, books } =
      await arrangeSeries(1);
    assert.deepEqual(await repository.clearSeries(seriesId, author), {
      inLibrary: false,
      notInterested: false,
    });
    await seedStatus(author.id, books[0]!, 'read');
    await repository.clearSeries(seriesId, author);
    assert.equal(await statusOf(repository, author, books[0]!), undefined);
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

  test('contract: a Series with only a Draft Book is a NotFoundError for a plain reader, not for its Co-author or a Moderator', async () => {
    const { repository, aBookInSeries, aSeries, anAccount, me, author } =
      await arrange(0);
    const seriesId = await aSeries([author.id]);
    await aBookInSeries(seriesId, [author.id], { draft: true });
    const moderator: Account = { id: await anAccount(), role: 'admin' };
    for (const action of [
      'addSeries',
      'toggleSeriesNotInterested',
      'clearSeries',
    ] as const) {
      await assert.rejects(
        repository[action](seriesId, me),
        new NotFoundError('Series', seriesId)
      );
    }
    await repository.clearSeries(seriesId, author);
    await repository.addSeries(seriesId, moderator);
  });

  test('contract: Series actions refuse a missing Series, add and not-interested also a Co-author', async () => {
    const { repository, me, author, seriesId } = await arrangeSeries();
    const actions = [
      ['addSeries', ADD_OWN_WORK],
      ['toggleSeriesNotInterested', NOT_INTERESTED_OWN_WORK],
      ['clearSeries', null],
    ] as const;
    for (const [action, message] of actions) {
      if (message) {
        await assert.rejects(
          repository[action](seriesId, author),
          new ForbiddenError(message)
        );
      }
      await assert.rejects(
        repository[action](MISSING_ID, me),
        new NotFoundError('Series', MISSING_ID)
      );
    }
  });

  test('contract: addSeries never lowers a status set at the same moment', async () => {
    const { repository, seedStatus, me, seriesId, books } =
      await arrangeSeries(1);
    await Promise.all([
      seedStatus(me.id, books[0]!, 'reading'),
      repository.addSeries(seriesId, me),
    ]);
    assert.equal(await statusOf(repository, me, books[0]!), 'reading');
  });

  // A Complete Book with Published Chapters `first` and `last`, then an
  // unpublished one.
  async function arrangeProgress() {
    const world = await arrange();
    const book = world.books[0]!;
    const first = await world.aChapter(book, { published: true });
    const last = await world.aChapter(book, { published: true });
    const hidden = await world.aChapter(book, { published: false });
    await world.setComplete(book);
    return { ...world, book, first, last, hidden };
  }

  test('contract: recordProgress opened moves none, plan_to_read and not_interested to reading, and leaves reading and read', async () => {
    const world = await arrange(5);
    const { repository, seedStatus, me, books } = world;
    await seedStatus(me.id, books[1]!, 'plan_to_read');
    await seedStatus(me.id, books[2]!, 'not_interested');
    await seedStatus(me.id, books[3]!, 'reading');
    await seedStatus(me.id, books[4]!, 'read');
    for (const id of books) {
      const chapterId = await world.aChapter(id, { published: true });
      await repository.recordProgress(id, { event: 'opened', chapterId }, me);
    }
    const statuses = [];
    for (const id of books) statuses.push(await statusOf(repository, me, id));
    assert.deepEqual(statuses, [
      'reading',
      'reading',
      'reading',
      'reading',
      'read',
    ]);
  });

  test('contract: recordProgress finished sets read on the last Published Chapter of a Complete Book only', async () => {
    const { repository, me, book, first, last, hidden } =
      await arrangeProgress();
    await repository.recordProgress(
      book,
      { event: 'finished', chapterId: first },
      me
    );
    assert.equal(await statusOf(repository, me, book), undefined);
    await repository.recordProgress(
      book,
      { event: 'finished', chapterId: last },
      me
    );
    assert.equal(await statusOf(repository, me, book), 'read');
    await assert.rejects(
      repository.recordProgress(
        book,
        { event: 'finished', chapterId: hidden },
        me
      ),
      new NotFoundError('Chapter', hidden)
    );
  });

  test('contract: a Chapter published exactly now is Published, one a second later is not', async (t) => {
    const world = await arrange();
    const { repository, me } = world;
    const book = world.books[0]!;
    const now = Math.floor(Date.now() / 1000) * 1000;
    const early = await world.aChapter(book, {
      published: true,
      publishedAt: new Date(now - 3_600_000),
    });
    const exact = await world.aChapter(book, {
      published: true,
      publishedAt: new Date(now),
    });
    const later = await world.aChapter(book, {
      published: true,
      publishedAt: new Date(now + 1000),
    });
    await world.setComplete(book);
    t.mock.timers.enable({ apis: ['Date'], now });
    await assert.rejects(
      repository.recordProgress(
        book,
        { event: 'finished', chapterId: later },
        me
      ),
      new NotFoundError('Chapter', later)
    );
    // `exact` is the last Published one: `later` does not count yet.
    await repository.recordProgress(
      book,
      { event: 'finished', chapterId: early },
      me
    );
    assert.equal(await statusOf(repository, me, book), undefined);
    await repository.recordProgress(
      book,
      { event: 'finished', chapterId: exact },
      me
    );
    assert.equal(await statusOf(repository, me, book), 'read');
  });

  test('contract: Chapters sharing a position: the higher id is the last one', async () => {
    const world = await arrange();
    const { repository, me } = world;
    const book = world.books[0]!;
    await world.aChapter(book, { published: true, position: 1 });
    const lowId = await world.aChapter(book, { published: true, position: 2 });
    const highId = await world.aChapter(book, { published: true, position: 2 });
    await world.setComplete(book);
    await repository.recordProgress(
      book,
      { event: 'finished', chapterId: lowId },
      me
    );
    assert.equal(await statusOf(repository, me, book), undefined);
    await repository.recordProgress(
      book,
      { event: 'finished', chapterId: highId },
      me
    );
    assert.equal(await statusOf(repository, me, book), 'read');
  });

  test('contract: recordProgress finished does nothing on a Book that is not Complete', async () => {
    const world = await arrange();
    const book = world.books[0]!;
    const chapterId = await world.aChapter(book, { published: true });
    await world.repository.recordProgress(
      book,
      { event: 'finished', chapterId },
      world.me
    );
    assert.equal(await statusOf(world.repository, world.me, book), undefined);
  });

  test('contract: recordProgress never lowers read', async () => {
    const { repository, seedStatus, me, book, first } = await arrangeProgress();
    await seedStatus(me.id, book, 'read');
    await repository.recordProgress(
      book,
      { event: 'opened', chapterId: first },
      me
    );
    assert.equal(await statusOf(repository, me, book), 'read');
  });

  test('contract: recordProgress opened never lowers a status set at the same moment', async () => {
    const { repository, seedStatus, me, book, first } = await arrangeProgress();
    await Promise.all([
      seedStatus(me.id, book, 'read'),
      repository.recordProgress(
        book,
        { event: 'opened', chapterId: first },
        me
      ),
    ]);
    assert.equal(await statusOf(repository, me, book), 'read');
  });

  test('contract: recordProgress refuses a Chapter of another Book, the Co-author, a missing Book and a Draft', async () => {
    const world = await arrangeProgress();
    const { repository, me, author, book, first } = world;
    const other = await world.aBook([author.id]);
    const otherChapter = await world.aChapter(other, { published: true });
    await assert.rejects(
      repository.recordProgress(
        book,
        { event: 'opened', chapterId: otherChapter },
        me
      ),
      new NotFoundError('Chapter', otherChapter)
    );
    await assert.rejects(
      repository.recordProgress(
        book,
        { event: 'opened', chapterId: otherChapter },
        author
      ),
      new ForbiddenError(PROGRESS_OWN_WORK)
    );
    await assert.rejects(
      repository.recordProgress(
        MISSING_ID,
        { event: 'opened', chapterId: first },
        me
      ),
      new NotFoundError('Book', MISSING_ID)
    );
    const draft = await world.aDraftBook([author.id]);
    await assert.rejects(
      repository.recordProgress(
        draft,
        { event: 'opened', chapterId: first },
        me
      ),
      new NotFoundError('Book', draft)
    );
  });

  test('contract: a Book no longer Published leaves list and total, and returns with its status', async () => {
    const { repository, seedStatus, setDraft, me, books } = await arrange();
    await seedStatus(me.id, books[0]!, 'reading');
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
