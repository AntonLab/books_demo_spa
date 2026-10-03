import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NotFoundError } from '../types/errors.ts';
import type { Account, LibraryRepository } from './libraryRepository.ts';

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
    await repository.clear(books[0]!, me.id);
    assert.equal((await repository.list(FIRST_PAGE, me)).total, 0);
    await repository.clear(books[0]!, me.id);
    await repository.clear(MISSING_ID, me.id);
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
