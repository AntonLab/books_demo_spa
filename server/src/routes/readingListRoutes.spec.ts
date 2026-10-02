import test from 'node:test';
import assert from 'node:assert/strict';
import type {
  ItemsResponse,
  MyReadingList,
  PagedResponse,
  PublicReadingList,
  ReadingListDetail,
  ReadingListEditItem,
  ReadingListItem,
  Wire,
} from 'shared';
import {
  aPublicBook,
  aPublicSeries,
} from '../repositories/favoriteRepository.fake.testkit.ts';
import { createFakeReadingListRepository } from '../repositories/readingListRepository.fake.testkit.ts';
import {
  json,
  ROLE_COOKIES,
  USER_IDS,
  withAuthenticatedApp,
} from './routeTestKit.testkit.ts';

const BOOK_ID = 7;
const OTHER_BOOK_ID = 8;
const DRAFT_ID = 9;
const SERIES_ID = 3;
const MISSING_ID = 999;

function fakeRepository(hiddenBooks = new Set([DRAFT_ID])) {
  return createFakeReadingListRepository({
    accounts: new Map(
      Object.values(USER_IDS).map((id) => [id, `Account${id}`])
    ),
    books: new Map(
      [BOOK_ID, OTHER_BOOK_ID, DRAFT_ID].map((id) => [id, aPublicBook(id)])
    ),
    series: new Map([[SERIES_ID, aPublicSeries(SERIES_ID)]]),
    hiddenBooks,
  });
}

const call = (
  base: string,
  cookie: string | undefined,
  method: string,
  path: string,
  body?: unknown
) =>
  fetch(`${base}/api/reading-lists${path}`, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(cookie ? { cookie } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

const user = ROLE_COOKIES.user;

async function createList(
  base: string,
  cookie = user,
  body: unknown = { title: 'Cold nights' }
) {
  const response = await call(base, cookie, 'POST', '', body);
  assert.equal(response.status, 201);
  return json<Wire<PublicReadingList>>(response);
}

test('a title alone creates a list owned by the caller; a Guest reads it, paged and by id', async () => {
  await withAuthenticatedApp(
    { readingListRepository: fakeRepository() },
    async (base) => {
      const list = await createList(base);
      assert.deepEqual(
        [list.owner.id, list.description, list.tags, list.itemCount],
        [USER_IDS.user, '', [], 0]
      );
      const detail = await call(base, undefined, 'GET', `/${list.id}`);
      assert.equal(detail.status, 200);
      assert.deepEqual((await json<Wire<ReadingListDetail>>(detail)).items, []);
      const page = await json<Wire<PagedResponse<PublicReadingList>>>(
        await call(base, undefined, 'GET', `?userId=${USER_IDS.user}`)
      );
      assert.deepEqual(
        [page.total, page.current, page.pageSize, page.items.map((l) => l.id)],
        [1, 1, 20, [list.id]]
      );
    }
  );
});

test('every write, and the two owner-scoped reads, answer a Guest with 401', async () => {
  await withAuthenticatedApp(
    { readingListRepository: fakeRepository() },
    async (base) => {
      const attempts: [string, string, unknown?][] = [
        ['POST', '', { title: 'x' }],
        ['PATCH', '/1', { title: 'x' }],
        ['DELETE', '/1'],
        ['POST', '/1/items', { bookId: BOOK_ID }],
        ['DELETE', '/1/items/1'],
        ['PUT', '/1/item-order', { itemIds: [1] }],
        ['POST', '/1/copy'],
        ['GET', '/mine'],
        ['GET', '/1/items'],
      ];
      for (const [method, path, body] of attempts) {
        assert.equal(
          (await call(base, undefined, method, path, body)).status,
          401,
          `${method} ${path}`
        );
      }
    }
  );
});

test('bad input is a 400: blank title, empty patch, both targets, odd ids, repeated ids, no userId', async () => {
  await withAuthenticatedApp(
    { readingListRepository: fakeRepository() },
    async (base) => {
      const { id } = await createList(base);
      const bad: [string, string, unknown?][] = [
        ['POST', '', { title: '   ' }],
        ['PATCH', `/${id}`, {}],
        ['PATCH', '/abc', { title: 'x' }],
        ['POST', `/${id}/items`, { bookId: BOOK_ID, seriesId: SERIES_ID }],
        ['POST', `/${id}/items`, {}],
        ['PUT', `/${id}/item-order`, { itemIds: [1, 1] }],
        ['GET', ''],
        ['GET', `/mine?bookId=${BOOK_ID}&seriesId=${SERIES_ID}`],
      ];
      for (const [method, path, body] of bad) {
        assert.equal(
          (await call(base, user, method, path, body)).status,
          400,
          `${method} ${path}`
        );
      }
    }
  );
});

test('only the owner writes: another account and a Moderator get 403, a missing list 404', async () => {
  await withAuthenticatedApp(
    { readingListRepository: fakeRepository() },
    async (base) => {
      const { id } = await createList(base);
      for (const cookie of [
        ROLE_COOKIES.author,
        ROLE_COOKIES.admin,
        ROLE_COOKIES.superadmin,
      ]) {
        const attempts: [string, string, unknown?][] = [
          ['PATCH', `/${id}`, { title: 'x' }],
          ['DELETE', `/${id}`],
          ['GET', `/${id}/items`],
          ['POST', `/${id}/items`, { bookId: BOOK_ID }],
          ['DELETE', `/${id}/items/1`],
          ['PUT', `/${id}/item-order`, { itemIds: [1] }],
        ];
        for (const [method, path, body] of attempts) {
          assert.equal(
            (await call(base, cookie, method, path, body)).status,
            403,
            `${method} ${path}`
          );
        }
      }
      assert.equal(
        (await call(base, user, 'GET', `/${MISSING_ID}`)).status,
        404
      );
      assert.equal(
        (await call(base, user, 'PATCH', `/${MISSING_ID}`, { title: 'x' }))
          .status,
        404
      );
    }
  );
});

test('items: add answers 201 and appends, 409 on a duplicate, 404 on a Draft, 204 on removing nothing', async () => {
  await withAuthenticatedApp(
    { readingListRepository: fakeRepository() },
    async (base) => {
      const { id } = await createList(base);
      const added = await call(base, user, 'POST', `/${id}/items`, {
        bookId: BOOK_ID,
      });
      assert.equal(added.status, 201);
      assert.equal((await json<Wire<ReadingListItem>>(added)).kind, 'book');
      await call(base, user, 'POST', `/${id}/items`, { seriesId: SERIES_ID });
      assert.equal(
        (await call(base, user, 'POST', `/${id}/items`, { bookId: BOOK_ID }))
          .status,
        409
      );
      assert.equal(
        (await call(base, user, 'POST', `/${id}/items`, { bookId: DRAFT_ID }))
          .status,
        404
      );
      assert.equal(
        (await call(base, user, 'DELETE', `/${id}/items/${MISSING_ID}`)).status,
        204
      );
      const detail = await json<Wire<ReadingListDetail>>(
        await call(base, undefined, 'GET', `/${id}`)
      );
      assert.deepEqual(
        [detail.items.map((i) => i.kind), detail.itemCount],
        [['book', 'series'], 2]
      );
    }
  );
});

test('reorder answers 204 and sets the order, a mismatched set is a 409', async () => {
  await withAuthenticatedApp(
    { readingListRepository: fakeRepository() },
    async (base) => {
      const { id } = await createList(base);
      const first = await json<Wire<ReadingListItem>>(
        await call(base, user, 'POST', `/${id}/items`, { bookId: BOOK_ID })
      );
      const second = await json<Wire<ReadingListItem>>(
        await call(base, user, 'POST', `/${id}/items`, {
          bookId: OTHER_BOOK_ID,
        })
      );
      assert.equal(
        (
          await call(base, user, 'PUT', `/${id}/item-order`, {
            itemIds: [second.id, first.id],
          })
        ).status,
        204
      );
      const detail = await json<Wire<ReadingListDetail>>(
        await call(base, undefined, 'GET', `/${id}`)
      );
      assert.deepEqual(
        detail.items.map((i) => i.id),
        [second.id, first.id]
      );
      assert.equal(
        (
          await call(base, user, 'PUT', `/${id}/item-order`, {
            itemIds: [first.id],
          })
        ).status,
        409
      );
    }
  );
});

test('a hidden item is absent from the public detail and "unavailable" in the owner\'s items', async () => {
  const hiddenBooks = new Set<number>();
  await withAuthenticatedApp(
    { readingListRepository: fakeRepository(hiddenBooks) },
    async (base) => {
      const { id } = await createList(base);
      await call(base, user, 'POST', `/${id}/items`, { bookId: BOOK_ID });
      // Draft after adding: the fake's hiddenBooks set is shared by reference.
      hiddenBooks.add(BOOK_ID);
      const detail = await json<Wire<ReadingListDetail>>(
        await call(base, undefined, 'GET', `/${id}`)
      );
      assert.deepEqual([detail.items, detail.itemCount], [[], 0]);
      const edit = await json<ItemsResponse<Wire<ReadingListEditItem>>>(
        await call(base, user, 'GET', `/${id}/items`)
      );
      assert.deepEqual(
        edit.items.map((i) => Object.keys(i).sort()),
        [['id', 'kind']]
      );
    }
  );
});

test("copy answers 201 with the caller's own list; /mine finds the work's item and is not read as an id", async () => {
  await withAuthenticatedApp(
    { readingListRepository: fakeRepository() },
    async (base) => {
      const { id } = await createList(base);
      const item = await json<Wire<ReadingListItem>>(
        await call(base, user, 'POST', `/${id}/items`, { bookId: BOOK_ID })
      );
      const copy = await call(base, ROLE_COOKIES.author, 'POST', `/${id}/copy`);
      assert.equal(copy.status, 201);
      const copied = await json<Wire<ReadingListDetail>>(copy);
      assert.deepEqual(
        [copied.owner.id, copied.items.length],
        [USER_IDS.author, 1]
      );
      const mine = await json<ItemsResponse<MyReadingList>>(
        await call(base, user, 'GET', `/mine?bookId=${BOOK_ID}`)
      );
      assert.deepEqual(
        mine.items.map((l) => [l.id, l.itemId]),
        [[id, item.id]]
      );
    }
  );
});

test('delete answers 204, then the list is a 404', async () => {
  await withAuthenticatedApp(
    { readingListRepository: fakeRepository() },
    async (base) => {
      const { id } = await createList(base);
      assert.equal((await call(base, user, 'DELETE', `/${id}`)).status, 204);
      assert.equal((await call(base, undefined, 'GET', `/${id}`)).status, 404);
    }
  );
});
