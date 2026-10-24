import test from 'node:test';
import assert from 'node:assert/strict';
import type {
  LibraryBook,
  PagedResponse,
  BookLibraryState,
  PublicBook,
  PublicLibraryEntry,
  ReadingStatus,
  SeriesLibraryState,
  Wire,
} from 'shared';
import {
  aLibraryBook,
  createFakeLibraryRepository,
} from '../repositories/libraryRepository.fake.testkit.ts';
import {
  json,
  ROLE_COOKIES,
  USER_IDS,
  withApp,
  withAuthenticatedApp,
} from './routeTestKit.testkit.ts';

const BOOK_ID = 7;
const OTHER_BOOK_ID = 8;
const DRAFT_ID = 9;
const MISSING_ID = 999;
const FREE_BOOK_ID = 10;
const NOT_INTERESTED_ID = 11;
const READING_ID = 12;
const READ_ID = 13;

const SERIES_ID = 20;
const SERIES_READING_ID = 21;
const SERIES_FREE_ID = 22;
const SERIES_NOT_INTERESTED_ID = 23;
const SERIES_DRAFT_BOOK_ID = 24;
const DRAFT_ONLY_SERIES_ID = 30;
const CREDITED_SERIES_ID = 40;
const MIXED_SERIES_ID = 50;
const MIXED_OWN_BOOK_ID = 51;
const MIXED_FREE_BOOK_ID = 52;
// Holds Published Books that are all free, for the not-interested toggle.
const FREE_SERIES_ID = 60;
const FREE_SERIES_BOOK_IDS = [61, 62];

const seriesBook = (
  id: number,
  seriesId: number,
  draft = false
): [number, PublicBook] => [id, aLibraryBook(id, { seriesId, draft })];

function fakeRepository(seed: ReadingSeed[] = []) {
  return createFakeLibraryRepository({
    accounts: new Set(Object.values(USER_IDS)),
    series: new Map([
      [SERIES_ID, { authorIds: [] }],
      [DRAFT_ONLY_SERIES_ID, { authorIds: [] }],
      [CREDITED_SERIES_ID, { authorIds: [USER_IDS.author] }],
      [MIXED_SERIES_ID, { authorIds: [] }],
      [FREE_SERIES_ID, { authorIds: [] }],
    ]),
    books: new Map([
      seriesBook(SERIES_READING_ID, SERIES_ID),
      seriesBook(SERIES_FREE_ID, SERIES_ID),
      seriesBook(SERIES_NOT_INTERESTED_ID, SERIES_ID),
      seriesBook(SERIES_DRAFT_BOOK_ID, SERIES_ID, true),
      seriesBook(31, DRAFT_ONLY_SERIES_ID, true),
      [
        MIXED_OWN_BOOK_ID,
        aLibraryBook(MIXED_OWN_BOOK_ID, {
          seriesId: MIXED_SERIES_ID,
          authorIds: [USER_IDS.author],
        }),
      ],
      seriesBook(MIXED_FREE_BOOK_ID, MIXED_SERIES_ID),
      ...FREE_SERIES_BOOK_IDS.map((id) => seriesBook(id, FREE_SERIES_ID)),
      [BOOK_ID, aLibraryBook(BOOK_ID, { authorIds: [USER_IDS.author] })],
      [OTHER_BOOK_ID, aLibraryBook(OTHER_BOOK_ID)],
      [
        DRAFT_ID,
        aLibraryBook(DRAFT_ID, { draft: true, authorIds: [USER_IDS.author] }),
      ],
      [FREE_BOOK_ID, aLibraryBook(FREE_BOOK_ID)],
      [NOT_INTERESTED_ID, aLibraryBook(NOT_INTERESTED_ID)],
      [READING_ID, aLibraryBook(READING_ID)],
      [READ_ID, aLibraryBook(READ_ID)],
    ]),
    seed,
  });
}

type ReadingSeed = {
  userId: number;
  bookId: number;
  status: ReadingStatus;
  updatedAt: Date;
};

const seedFor = (bookId: number, status: ReadingStatus): ReadingSeed => ({
  userId: USER_IDS.user,
  bookId,
  status,
  updatedAt: new Date(),
});

const SERIES_SEED = [
  seedFor(SERIES_READING_ID, 'reading'),
  seedFor(SERIES_NOT_INTERESTED_ID, 'not_interested'),
];

const post = (base: string, cookie: string, path: string) =>
  fetch(`${base}/api/library/${path}`, { method: 'POST', headers: { cookie } });

const put = (base: string, cookie: string, bookId: number, body: unknown) =>
  fetch(`${base}/api/library/${bookId}`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify(body),
  });
const clear = (base: string, cookie: string, bookId: number) =>
  fetch(`${base}/api/library/${bookId}`, {
    method: 'DELETE',
    headers: { cookie },
  });
const list = (base: string, cookie: string, query = '') =>
  fetch(`${base}/api/library${query}`, { headers: { cookie } });

test('setting a status answers 200 with the status, and again with another replaces it', async () => {
  await withAuthenticatedApp(
    { libraryRepository: fakeRepository() },
    async (base) => {
      const first = await put(base, ROLE_COOKIES.user, BOOK_ID, {
        status: 'reading',
      });
      assert.equal(first.status, 200);
      const entry = await json<Wire<PublicLibraryEntry>>(first);
      assert.deepEqual([entry.bookId, entry.status], [BOOK_ID, 'reading']);
      await put(base, ROLE_COOKIES.user, BOOK_ID, { status: 'read' });
      const page = await json<Wire<PagedResponse<LibraryBook>>>(
        await list(base, ROLE_COOKIES.user)
      );
      assert.deepEqual(
        page.items.map((item) => [item.id, item.readingStatus]),
        [[BOOK_ID, 'read']]
      );
    }
  );
});

test('a bad status or a non-numeric id is a 400', async () => {
  await withAuthenticatedApp(
    { libraryRepository: fakeRepository() },
    async (base) => {
      assert.equal(
        (await put(base, ROLE_COOKIES.user, BOOK_ID, { status: 'owned' }))
          .status,
        400
      );
      assert.equal(
        (await put(base, ROLE_COOKIES.user, BOOK_ID, {})).status,
        400
      );
      const badId = await fetch(`${base}/api/library/abc`, {
        method: 'PUT',
        headers: {
          'content-type': 'application/json',
          cookie: ROLE_COOKIES.user,
        },
        body: JSON.stringify({ status: 'read' }),
      });
      assert.equal(badId.status, 400);
    }
  );
});

test('a missing Book, or a Draft the caller may not read, is a 404', async () => {
  await withAuthenticatedApp(
    { libraryRepository: fakeRepository() },
    async (base) => {
      assert.equal(
        (await put(base, ROLE_COOKIES.user, MISSING_ID, { status: 'read' }))
          .status,
        404
      );
      assert.equal(
        (await put(base, ROLE_COOKIES.user, DRAFT_ID, { status: 'read' }))
          .status,
        404
      );
      assert.equal(
        (await put(base, ROLE_COOKIES.author, DRAFT_ID, { status: 'read' }))
          .status,
        200
      );
    }
  );
});

test('clearing answers 204 whether or not a status was set', async () => {
  await withAuthenticatedApp(
    { libraryRepository: fakeRepository() },
    async (base) => {
      await put(base, ROLE_COOKIES.user, BOOK_ID, { status: 'read' });
      assert.equal((await clear(base, ROLE_COOKIES.user, BOOK_ID)).status, 204);
      assert.equal((await clear(base, ROLE_COOKIES.user, BOOK_ID)).status, 204);
      assert.equal(
        (await clear(base, ROLE_COOKIES.user, MISSING_ID)).status,
        204
      );
    }
  );
});

test('the list defaults to every status but Not interested and filters by status', async () => {
  await withAuthenticatedApp(
    { libraryRepository: fakeRepository() },
    async (base) => {
      await put(base, ROLE_COOKIES.user, BOOK_ID, { status: 'read' });
      await put(base, ROLE_COOKIES.user, OTHER_BOOK_ID, {
        status: 'not_interested',
      });
      const all = await json<Wire<PagedResponse<LibraryBook>>>(
        await list(base, ROLE_COOKIES.user)
      );
      assert.deepEqual(
        [
          all.items.map((item) => item.id),
          all.total,
          all.current,
          all.pageSize,
        ],
        [[BOOK_ID], 1, 1, 20]
      );
      const hidden = await json<Wire<PagedResponse<LibraryBook>>>(
        await list(base, ROLE_COOKIES.user, '?status=not_interested')
      );
      assert.deepEqual(
        hidden.items.map((item) => item.id),
        [OTHER_BOOK_ID]
      );
    }
  );
});

test('a page past the end is 200 with no items and the real total', async () => {
  await withAuthenticatedApp(
    { libraryRepository: fakeRepository() },
    async (base) => {
      await put(base, ROLE_COOKIES.user, BOOK_ID, { status: 'read' });
      const page = await json<Wire<PagedResponse<LibraryBook>>>(
        await list(base, ROLE_COOKIES.user, '?current=9&pageSize=5')
      );
      assert.deepEqual(
        [page.items.length, page.total, page.current, page.pageSize],
        [0, 1, 9, 5]
      );
    }
  );
});

test('another account never sees the caller entries', async () => {
  await withAuthenticatedApp(
    { libraryRepository: fakeRepository() },
    async (base) => {
      await put(base, ROLE_COOKIES.user, BOOK_ID, { status: 'read' });
      const page = await json<Wire<PagedResponse<LibraryBook>>>(
        await list(base, ROLE_COOKIES.admin)
      );
      assert.equal(page.total, 0);
    }
  );
});

test('add: no status becomes plan_to_read, and pressing again keeps it', async () => {
  await withAuthenticatedApp(
    { libraryRepository: fakeRepository() },
    async (base) => {
      for (let i = 0; i < 2; i += 1) {
        const res = await post(base, ROLE_COOKIES.user, `${FREE_BOOK_ID}/add`);
        assert.equal(res.status, 200);
        assert.deepEqual(await json<Wire<BookLibraryState>>(res), {
          bookId: FREE_BOOK_ID,
          status: 'plan_to_read',
        });
      }
    }
  );
});

test('add: not_interested becomes plan_to_read; reading and read are unchanged', async () => {
  await withAuthenticatedApp(
    {
      libraryRepository: fakeRepository([
        seedFor(NOT_INTERESTED_ID, 'not_interested'),
        seedFor(READING_ID, 'reading'),
        seedFor(READ_ID, 'read'),
      ]),
    },
    async (base) => {
      const statuses: unknown[] = [];
      for (const id of [NOT_INTERESTED_ID, READING_ID, READ_ID]) {
        const res = await post(base, ROLE_COOKIES.user, `${id}/add`);
        assert.equal(res.status, 200);
        statuses.push((await json<Wire<BookLibraryState>>(res)).status);
      }
      assert.deepEqual(statuses, ['plan_to_read', 'reading', 'read']);
    }
  );
});

test('not-interested: none and plan_to_read become not_interested, a second press clears it', async () => {
  await withAuthenticatedApp(
    { libraryRepository: fakeRepository() },
    async (base) => {
      const press = async (id: number) => {
        const res = await post(base, ROLE_COOKIES.user, `${id}/not-interested`);
        assert.equal(res.status, 200);
        return (await json<Wire<BookLibraryState>>(res)).status;
      };
      assert.equal(await press(FREE_BOOK_ID), 'not_interested');
      await press(FREE_BOOK_ID);
      await post(base, ROLE_COOKIES.user, `${OTHER_BOOK_ID}/add`);
      assert.equal(await press(OTHER_BOOK_ID), 'not_interested');
      const cleared = await post(
        base,
        ROLE_COOKIES.user,
        `${OTHER_BOOK_ID}/not-interested`
      );
      assert.equal(cleared.status, 200);
      assert.deepEqual(await json<Wire<BookLibraryState>>(cleared), {
        bookId: OTHER_BOOK_ID,
        status: null,
      });
      const hidden = await json<Wire<PagedResponse<LibraryBook>>>(
        await list(base, ROLE_COOKIES.user, '?status=not_interested')
      );
      assert.deepEqual(
        hidden.items.map((item) => item.id),
        []
      );
    }
  );
});

test('not-interested: reading and read answer 409', async () => {
  await withAuthenticatedApp(
    {
      libraryRepository: fakeRepository([
        seedFor(READING_ID, 'reading'),
        seedFor(READ_ID, 'read'),
      ]),
    },
    async (base) => {
      for (const id of [READING_ID, READ_ID]) {
        const res = await post(base, ROLE_COOKIES.user, `${id}/not-interested`);
        assert.equal(res.status, 409);
      }
      const page = await json<Wire<PagedResponse<LibraryBook>>>(
        await list(base, ROLE_COOKIES.user, '?status=reading')
      );
      assert.deepEqual(
        page.items.map((item) => item.id),
        [READING_ID]
      );
    }
  );
});

test('a Co-author gets 403 on add, not-interested and remove of their own Book', async () => {
  await withAuthenticatedApp(
    { libraryRepository: fakeRepository() },
    async (base) => {
      const cookie = ROLE_COOKIES.author;
      assert.equal((await post(base, cookie, `${BOOK_ID}/add`)).status, 403);
      assert.equal(
        (await post(base, cookie, `${BOOK_ID}/not-interested`)).status,
        403
      );
      assert.equal((await clear(base, cookie, BOOK_ID)).status, 403);
    }
  );
});

test('remove clears whatever status is set', async () => {
  await withAuthenticatedApp(
    { libraryRepository: fakeRepository([seedFor(READ_ID, 'read')]) },
    async (base) => {
      assert.equal((await clear(base, ROLE_COOKIES.user, READ_ID)).status, 204);
      const page = await json<Wire<PagedResponse<LibraryBook>>>(
        await list(base, ROLE_COOKIES.user)
      );
      assert.equal(page.total, 0);
    }
  );
});

test('Guest gets 401; a missing Book or an unreadable Draft gets 404; a bad id gets 400', async () => {
  await withApp({ libraryRepository: fakeRepository() }, async (base) => {
    for (const action of ['add', 'not-interested']) {
      assert.equal((await post(base, '', `${BOOK_ID}/${action}`)).status, 401);
    }
  });
  await withAuthenticatedApp(
    { libraryRepository: fakeRepository() },
    async (base) => {
      for (const action of ['add', 'not-interested']) {
        const as = (path: string) => post(base, ROLE_COOKIES.user, path);
        assert.equal((await as(`${MISSING_ID}/${action}`)).status, 404);
        assert.equal((await as(`${DRAFT_ID}/${action}`)).status, 404);
        assert.equal((await as(`abc/${action}`)).status, 400);
      }
    }
  );
});

const seriesPath = (id: number | string, action = '') =>
  `series/${id}${action && `/${action}`}`;

const statusesOf = async (base: string, cookie: string) => {
  const page = await json<Wire<PagedResponse<LibraryBook>>>(
    await list(base, cookie, '?pageSize=100')
  );
  return Object.fromEntries(
    page.items.map((item) => [item.id, item.readingStatus])
  );
};

const seriesPress = async (base: string, path: string, cookie?: string) => {
  const res = await post(base, cookie ?? ROLE_COOKIES.user, path);
  assert.equal(res.status, 200);
  return json<Wire<SeriesLibraryState>>(res);
};

test('series add: promotes none and not_interested, leaves reading, skips Drafts', async () => {
  await withAuthenticatedApp(
    { libraryRepository: fakeRepository(SERIES_SEED) },
    async (base) => {
      assert.deepEqual(await seriesPress(base, seriesPath(SERIES_ID, 'add')), {
        inLibrary: true,
        notInterested: false,
      });
      assert.deepEqual(await statusesOf(base, ROLE_COOKIES.user), {
        [SERIES_READING_ID]: 'reading',
        [SERIES_FREE_ID]: 'plan_to_read',
        [SERIES_NOT_INTERESTED_ID]: 'plan_to_read',
      });
    }
  );
});

test('series not-interested: sets none only, and a second press clears', async () => {
  await withAuthenticatedApp(
    { libraryRepository: fakeRepository(SERIES_SEED) },
    async (base) => {
      const path = seriesPath(FREE_SERIES_ID, 'not-interested');
      assert.deepEqual(await seriesPress(base, path), {
        inLibrary: false,
        notInterested: true,
      });
      assert.deepEqual(await seriesPress(base, path), {
        inLibrary: false,
        notInterested: false,
      });
      const hidden = await json<Wire<PagedResponse<LibraryBook>>>(
        await list(base, ROLE_COOKIES.user, '?status=not_interested')
      );
      assert.deepEqual(
        hidden.items.map((item) => item.id),
        [SERIES_NOT_INTERESTED_ID]
      );

      assert.deepEqual(
        await seriesPress(base, seriesPath(SERIES_ID, 'not-interested')),
        { inLibrary: true, notInterested: false }
      );
      assert.deepEqual(await statusesOf(base, ROLE_COOKIES.user), {
        [SERIES_READING_ID]: 'reading',
      });
      const marked = await json<Wire<PagedResponse<LibraryBook>>>(
        await list(base, ROLE_COOKIES.user, '?status=not_interested')
      );
      assert.deepEqual(marked.items.map((item) => item.id).sort(), [
        SERIES_FREE_ID,
        SERIES_NOT_INTERESTED_ID,
      ]);
    }
  );
});

test('series remove: clears every Published Book, answers 200 with both flags false', async () => {
  await withAuthenticatedApp(
    { libraryRepository: fakeRepository(SERIES_SEED) },
    async (base) => {
      const res = await fetch(`${base}/api/library/${seriesPath(SERIES_ID)}`, {
        method: 'DELETE',
        headers: { cookie: ROLE_COOKIES.user },
      });
      assert.equal(res.status, 200);
      assert.deepEqual(await json<Wire<SeriesLibraryState>>(res), {
        inLibrary: false,
        notInterested: false,
      });
      assert.deepEqual(await statusesOf(base, ROLE_COOKIES.user), {});
      const hidden = await json<Wire<PagedResponse<LibraryBook>>>(
        await list(base, ROLE_COOKIES.user, '?status=not_interested')
      );
      assert.equal(hidden.total, 0);
    }
  );
});

test('series with no Published Book: 200, both flags false, nothing written', async () => {
  await withAuthenticatedApp(
    { libraryRepository: fakeRepository() },
    async (base) => {
      for (const action of ['add', 'not-interested']) {
        assert.deepEqual(
          await seriesPress(base, seriesPath(DRAFT_ONLY_SERIES_ID, action)),
          { inLibrary: false, notInterested: false }
        );
      }
      const hidden = await json<Wire<PagedResponse<LibraryBook>>>(
        await list(base, ROLE_COOKIES.user, '?status=not_interested')
      );
      assert.deepEqual(await statusesOf(base, ROLE_COOKIES.user), {});
      assert.equal(hidden.total, 0);
    }
  );
});

test('series action skips a Book the Account co-authors', async () => {
  await withAuthenticatedApp(
    { libraryRepository: fakeRepository() },
    async (base) => {
      await seriesPress(
        base,
        seriesPath(MIXED_SERIES_ID, 'add'),
        ROLE_COOKIES.author
      );
      assert.deepEqual(await statusesOf(base, ROLE_COOKIES.author), {
        [MIXED_FREE_BOOK_ID]: 'plan_to_read',
      });
    }
  );
});

test('series not-interested with a co-authored Book: the free Books are marked, a second press clears them', async () => {
  await withAuthenticatedApp(
    { libraryRepository: fakeRepository() },
    async (base) => {
      const path = seriesPath(MIXED_SERIES_ID, 'not-interested');
      const cookie = ROLE_COOKIES.author;
      // The shared flag still reads false: the co-authored Book holds no entry.
      const flags = { inLibrary: false, notInterested: false };
      assert.deepEqual(await seriesPress(base, path, cookie), flags);
      const marked = await json<Wire<PagedResponse<LibraryBook>>>(
        await list(base, cookie, '?status=not_interested')
      );
      assert.deepEqual(
        marked.items.map((item) => item.id),
        [MIXED_FREE_BOOK_ID]
      );
      assert.deepEqual(await seriesPress(base, path, cookie), flags);
      const cleared = await json<Wire<PagedResponse<LibraryBook>>>(
        await list(base, cookie, '?status=not_interested')
      );
      assert.equal(cleared.total, 0);
    }
  );
});

test('a Co-author of the Series gets 403; a missing Series gets 404; a Guest 401; id abc 400', async () => {
  await withApp({ libraryRepository: fakeRepository() }, async (base) => {
    for (const action of ['add', 'not-interested']) {
      const res = await post(base, '', seriesPath(SERIES_ID, action));
      assert.equal(res.status, 401);
    }
    const guestClear = await fetch(
      `${base}/api/library/${seriesPath(SERIES_ID)}`,
      { method: 'DELETE' }
    );
    assert.equal(guestClear.status, 401);
  });
  await withAuthenticatedApp(
    { libraryRepository: fakeRepository() },
    async (base) => {
      const request = (id: number | string, action: string, cookie: string) =>
        action === 'remove'
          ? fetch(`${base}/api/library/${seriesPath(id)}`, {
              method: 'DELETE',
              headers: { cookie },
            })
          : post(base, cookie, seriesPath(id, action));
      for (const action of ['add', 'not-interested', 'remove']) {
        const status = async (id: number | string, cookie: string) =>
          (await request(id, action, cookie)).status;
        assert.equal(
          await status(CREDITED_SERIES_ID, ROLE_COOKIES.author),
          403
        );
        assert.equal(await status(MISSING_ID, ROLE_COOKIES.user), 404);
        assert.equal(await status('abc', ROLE_COOKIES.user), 400);
      }
    }
  );
});

const COMPLETE_ID = 60;
const IN_PROGRESS_ID = 61;
const CREDITED_ID = 62;
const FIRST_CHAPTER = 601;
const LAST_PUBLISHED_CHAPTER = 602;
const UNPUBLISHED_CHAPTER = 603;
const IN_PROGRESS_CHAPTER = 611;
const CREDITED_CHAPTER = 621;

// Book 60 is Complete: Chapters 601 and 602 are Published, 603 is not.
function progressRepository(seed: ReadingSeed[] = []) {
  const chapter = (
    id: number,
    bookId: number,
    position: number,
    published = true
  ) => ({
    id,
    bookId,
    position,
    publishedAt: published ? new Date(0) : null,
  });
  return createFakeLibraryRepository({
    accounts: new Set(Object.values(USER_IDS)),
    books: new Map([
      [COMPLETE_ID, aLibraryBook(COMPLETE_ID, { complete: true })],
      [IN_PROGRESS_ID, aLibraryBook(IN_PROGRESS_ID)],
      [
        CREDITED_ID,
        aLibraryBook(CREDITED_ID, { authorIds: [USER_IDS.author] }),
      ],
      [63, aLibraryBook(63)],
      [64, aLibraryBook(64)],
      [65, aLibraryBook(65)],
    ]),
    chapters: [
      chapter(FIRST_CHAPTER, COMPLETE_ID, 1),
      chapter(LAST_PUBLISHED_CHAPTER, COMPLETE_ID, 2),
      chapter(UNPUBLISHED_CHAPTER, COMPLETE_ID, 3, false),
      chapter(IN_PROGRESS_CHAPTER, IN_PROGRESS_ID, 1),
      chapter(CREDITED_CHAPTER, CREDITED_ID, 1),
      chapter(631, 63, 1),
      chapter(641, 64, 1),
      chapter(651, 65, 1),
    ],
    seed,
  });
}

const progress = (
  base: string,
  cookie: string,
  bookId: number | string,
  body: unknown
) =>
  fetch(`${base}/api/books/${bookId}/reading-progress`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify(body),
  });

test('opened moves none, plan_to_read and not_interested to reading, and leaves reading and read', async () => {
  await withAuthenticatedApp(
    {
      libraryRepository: progressRepository([
        seedFor(63, 'plan_to_read'),
        seedFor(64, 'not_interested'),
        seedFor(65, 'read'),
      ]),
    },
    async (base) => {
      const cookie = ROLE_COOKIES.user;
      for (const [bookId, chapterId] of [
        [IN_PROGRESS_ID, IN_PROGRESS_CHAPTER],
        [63, 631],
        [64, 641],
        [65, 651],
      ] as const) {
        const res = await progress(base, cookie, bookId, {
          event: 'opened',
          chapterId,
        });
        assert.equal(res.status, 204);
      }
      assert.deepEqual(await statusesOf(base, cookie), {
        [IN_PROGRESS_ID]: 'reading',
        63: 'reading',
        64: 'reading',
        65: 'read',
      });
    }
  );
});

test('finished sets read only on the last Published Chapter of a Complete Book', async () => {
  await withAuthenticatedApp(
    { libraryRepository: progressRepository() },
    async (base) => {
      const cookie = ROLE_COOKIES.user;
      for (let i = 0; i < 2; i += 1) {
        const res = await progress(base, cookie, COMPLETE_ID, {
          event: 'finished',
          chapterId: LAST_PUBLISHED_CHAPTER,
        });
        assert.equal(res.status, 204);
        assert.deepEqual(await statusesOf(base, cookie), {
          [COMPLETE_ID]: 'read',
        });
      }
    }
  );
});

test('finished is a no-op on a Chapter that is not the last Published one, and on a Book that is not Complete', async () => {
  await withAuthenticatedApp(
    { libraryRepository: progressRepository() },
    async (base) => {
      const cookie = ROLE_COOKIES.user;
      const first = await progress(base, cookie, COMPLETE_ID, {
        event: 'finished',
        chapterId: FIRST_CHAPTER,
      });
      const open = await progress(base, cookie, IN_PROGRESS_ID, {
        event: 'finished',
        chapterId: IN_PROGRESS_CHAPTER,
      });
      assert.deepEqual([first.status, open.status], [204, 204]);
      assert.deepEqual(await statusesOf(base, cookie), {});
    }
  );
});

test('finished does not lower read to anything', async () => {
  await withAuthenticatedApp(
    { libraryRepository: progressRepository([seedFor(COMPLETE_ID, 'read')]) },
    async (base) => {
      const res = await progress(base, ROLE_COOKIES.user, COMPLETE_ID, {
        event: 'opened',
        chapterId: FIRST_CHAPTER,
      });
      assert.equal(res.status, 204);
      assert.deepEqual(await statusesOf(base, ROLE_COOKIES.user), {
        [COMPLETE_ID]: 'read',
      });
    }
  );
});

test('a Chapter of another Book, or an unpublished Chapter, is 404', async () => {
  await withAuthenticatedApp(
    { libraryRepository: progressRepository() },
    async (base) => {
      for (const chapterId of [IN_PROGRESS_CHAPTER, UNPUBLISHED_CHAPTER]) {
        const res = await progress(base, ROLE_COOKIES.user, COMPLETE_ID, {
          event: 'opened',
          chapterId,
        });
        assert.equal(res.status, 404);
      }
    }
  );
});

test('reading progress: Guest 401, Co-author 403, unreadable Book 404, bad event or missing chapterId 400', async () => {
  const body = { event: 'opened', chapterId: FIRST_CHAPTER };
  await withApp({ libraryRepository: progressRepository() }, async (base) => {
    assert.equal((await progress(base, '', COMPLETE_ID, body)).status, 401);
  });
  await withAuthenticatedApp(
    { libraryRepository: progressRepository() },
    async (base) => {
      const as = (cookie: string, id: number | string, payload: unknown) =>
        progress(base, cookie, id, payload).then((res) => res.status);
      assert.equal(
        await as(ROLE_COOKIES.author, CREDITED_ID, {
          event: 'opened',
          chapterId: CREDITED_CHAPTER,
        }),
        403
      );
      assert.equal(await as(ROLE_COOKIES.user, MISSING_ID, body), 404);
      assert.equal(
        await as(ROLE_COOKIES.user, COMPLETE_ID, {
          event: 'closed',
          chapterId: FIRST_CHAPTER,
        }),
        400
      );
      assert.equal(
        await as(ROLE_COOKIES.user, COMPLETE_ID, { event: 'opened' }),
        400
      );
      assert.equal(await as(ROLE_COOKIES.user, 'abc', body), 400);
    }
  );
});

test('the Co-author check runs before the Chapter check', async () => {
  await withAuthenticatedApp(
    { libraryRepository: progressRepository() },
    async (base) => {
      const res = await progress(base, ROLE_COOKIES.author, CREDITED_ID, {
        event: 'opened',
        chapterId: IN_PROGRESS_CHAPTER,
      });
      assert.equal(res.status, 403);
    }
  );
});

// The guard runs before validate, as for favorites: a Guest never gets a 400.
test('every library route is a 401 without a session', async () => {
  await withApp({ libraryRepository: fakeRepository() }, async (base) => {
    const statuses = [
      (await fetch(`${base}/api/library`)).status,
      (await fetch(`${base}/api/library?current=0`)).status,
      (await fetch(`${base}/api/library/${BOOK_ID}`, { method: 'PUT' })).status,
      (await fetch(`${base}/api/library/${BOOK_ID}`, { method: 'DELETE' }))
        .status,
    ];
    assert.deepEqual(statuses, [401, 401, 401, 401]);
  });
});
