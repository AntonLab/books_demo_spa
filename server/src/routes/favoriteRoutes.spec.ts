import test from 'node:test';
import assert from 'node:assert/strict';
import type {
  FavoriteBook,
  FavoriteSeries,
  ListResponse,
  PublicFavorite,
  Wire,
} from 'shared';
import {
  aPublicBook,
  aPublicSeries,
  createFakeFavoriteRepository,
} from '../repositories/favoriteRepository.fake.testkit.ts';
import {
  json,
  ROLE_COOKIES,
  USER_IDS,
  withApp,
  withAuthenticatedApp,
} from './routeTestKit.testkit.ts';

const BOOK_ID = 7;
const OTHER_BOOK_ID = 8;
const SERIES_ID = 3;
const MISSING_ID = 999;

// Every persona is an account, so the fake's userId foreign key passes for
// whoever signs in. Visibility is the real repository's, proven on MySQL.
function fakeRepository() {
  return createFakeFavoriteRepository({
    accounts: new Set(Object.values(USER_IDS)),
    books: new Map([
      [BOOK_ID, aPublicBook(BOOK_ID)],
      [OTHER_BOOK_ID, aPublicBook(OTHER_BOOK_ID)],
    ]),
    series: new Map([[SERIES_ID, aPublicSeries(SERIES_ID)]]),
  });
}

function post(base: string, cookie: string, body: unknown) {
  return fetch(`${base}/api/favorites`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify(body),
  });
}

function remove(base: string, cookie: string, id: number) {
  return fetch(`${base}/api/favorites/${id}`, {
    method: 'DELETE',
    headers: { cookie },
  });
}

function get(base: string, cookie: string, path: string) {
  return fetch(`${base}/api/favorites${path}`, { headers: { cookie } });
}

test('favoriting a book answers 201 with a favorite held by the caller', async () => {
  await withAuthenticatedApp(
    { favoriteRepository: fakeRepository() },
    async (base) => {
      const response = await post(base, ROLE_COOKIES.user, { bookId: BOOK_ID });

      assert.equal(response.status, 201);
      const favorite = await json<Wire<PublicFavorite>>(response);
      assert.deepEqual(
        [favorite.userId, favorite.bookId, favorite.seriesId],
        [USER_IDS.user, BOOK_ID, null]
      );
    }
  );
});

test('a userId in the body is ignored: the holder comes from the session', async () => {
  await withAuthenticatedApp(
    { favoriteRepository: fakeRepository() },
    async (base) => {
      const response = await post(base, ROLE_COOKIES.user, {
        userId: USER_IDS.otherAuthor,
        seriesId: SERIES_ID,
      });

      assert.equal(response.status, 201);
      assert.equal(
        (await json<Wire<PublicFavorite>>(response)).userId,
        USER_IDS.user
      );
    }
  );
});

test('every signed-in role may favorite, Moderators included', async () => {
  await withAuthenticatedApp(
    { favoriteRepository: fakeRepository() },
    async (base) => {
      for (const cookie of [
        ROLE_COOKIES.user,
        ROLE_COOKIES.author,
        ROLE_COOKIES.admin,
        ROLE_COOKIES.superadmin,
      ]) {
        const response = await post(base, cookie, { bookId: BOOK_ID });
        assert.equal(response.status, 201);
      }
    }
  );
});

test('favoriting the same work twice is a 409, not a second row', async () => {
  await withAuthenticatedApp(
    { favoriteRepository: fakeRepository() },
    async (base) => {
      await post(base, ROLE_COOKIES.user, { bookId: BOOK_ID });
      const repeat = await post(base, ROLE_COOKIES.user, { bookId: BOOK_ID });

      assert.equal(repeat.status, 409);
      const list = await json<Wire<ListResponse<FavoriteBook>>>(
        await get(base, ROLE_COOKIES.user, '/books')
      );
      assert.equal(list.total, 1);
    }
  );
});

test('favoriting a missing book or series is a 404', async () => {
  await withAuthenticatedApp(
    { favoriteRepository: fakeRepository() },
    async (base) => {
      assert.equal(
        (await post(base, ROLE_COOKIES.user, { bookId: MISSING_ID })).status,
        404
      );
      assert.equal(
        (await post(base, ROLE_COOKIES.user, { seriesId: MISSING_ID })).status,
        404
      );
    }
  );
});

test('a body naming both targets, or neither, is a 400', async () => {
  await withAuthenticatedApp(
    { favoriteRepository: fakeRepository() },
    async (base) => {
      assert.equal(
        (
          await post(base, ROLE_COOKIES.user, {
            bookId: BOOK_ID,
            seriesId: SERIES_ID,
          })
        ).status,
        400
      );
      assert.equal((await post(base, ROLE_COOKIES.user, {})).status, 400);
    }
  );
});

test('removing your own favorite is a 204, and a second time a 404', async () => {
  await withAuthenticatedApp(
    { favoriteRepository: fakeRepository() },
    async (base) => {
      const created = await json<Wire<PublicFavorite>>(
        await post(base, ROLE_COOKIES.user, { bookId: BOOK_ID })
      );

      assert.equal(
        (await remove(base, ROLE_COOKIES.user, created.id)).status,
        204
      );
      assert.equal(
        (await remove(base, ROLE_COOKIES.user, created.id)).status,
        404
      );
    }
  );
});

// Favorites are private: a Moderator has no `any` on them, and another
// account's id answers exactly like a missing one.
test("removing another account's favorite is a 404 and keeps it, for a Moderator too", async () => {
  await withAuthenticatedApp(
    { favoriteRepository: fakeRepository() },
    async (base) => {
      const created = await json<Wire<PublicFavorite>>(
        await post(base, ROLE_COOKIES.otherAuthor, { bookId: BOOK_ID })
      );

      for (const cookie of [ROLE_COOKIES.user, ROLE_COOKIES.superadmin]) {
        assert.equal((await remove(base, cookie, created.id)).status, 404);
      }
      const list = await json<Wire<ListResponse<FavoriteBook>>>(
        await get(base, ROLE_COOKIES.otherAuthor, '/books')
      );
      assert.equal(list.total, 1);
    }
  );
});

test('a non-numeric favorite id is a 400', async () => {
  await withAuthenticatedApp(
    { favoriteRepository: fakeRepository() },
    async (base) => {
      const response = await fetch(`${base}/api/favorites/abc`, {
        method: 'DELETE',
        headers: { cookie: ROLE_COOKIES.user },
      });
      assert.equal(response.status, 400);
    }
  );
});

test("the books list holds the caller's own favorites, newest first, in the paging envelope", async () => {
  await withAuthenticatedApp(
    { favoriteRepository: fakeRepository() },
    async (base) => {
      await post(base, ROLE_COOKIES.user, { bookId: BOOK_ID });
      await post(base, ROLE_COOKIES.user, { bookId: OTHER_BOOK_ID });
      await post(base, ROLE_COOKIES.user, { seriesId: SERIES_ID });
      await post(base, ROLE_COOKIES.author, { bookId: BOOK_ID });

      const response = await get(base, ROLE_COOKIES.user, '/books?limit=1');

      assert.equal(response.status, 200);
      const page = await json<Wire<ListResponse<FavoriteBook>>>(response);
      assert.equal(page.total, 2);
      assert.equal(page.limit, 1);
      assert.equal(page.offset, 0);
      assert.deepEqual(
        page.items.map((item) => item.book.id),
        [OTHER_BOOK_ID]
      );
    }
  );
});

test("the series list holds the caller's own series favorites only", async () => {
  await withAuthenticatedApp(
    { favoriteRepository: fakeRepository() },
    async (base) => {
      await post(base, ROLE_COOKIES.user, { bookId: BOOK_ID });
      const onSeries = await json<Wire<PublicFavorite>>(
        await post(base, ROLE_COOKIES.user, { seriesId: SERIES_ID })
      );

      const page = await json<Wire<ListResponse<FavoriteSeries>>>(
        await get(base, ROLE_COOKIES.user, '/series')
      );

      assert.deepEqual(
        page.items.map((item) => [item.id, item.series.id]),
        [[onSeries.id, SERIES_ID]]
      );
      assert.deepEqual([page.total, page.limit, page.offset], [1, 20, 0]);
    }
  );
});

test('a limit out of range is a 400', async () => {
  await withAuthenticatedApp(
    { favoriteRepository: fakeRepository() },
    async (base) => {
      for (const path of ['/books?limit=0', '/series?limit=101']) {
        assert.equal((await get(base, ROLE_COOKIES.user, path)).status, 400);
      }
    }
  );
});

// The guard runs before validate, so even a malformed request from a Guest is
// a 401: nothing about the body or query leaks through a 400.
test('every favorites route is a 401 without a session, before any parsing', async () => {
  await withApp({ favoriteRepository: fakeRepository() }, async (base) => {
    const responses = [
      await fetch(`${base}/api/favorites`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({}),
      }),
      await fetch(`${base}/api/favorites/abc`, { method: 'DELETE' }),
      await fetch(`${base}/api/favorites/books?limit=0`),
      await fetch(`${base}/api/favorites/series?limit=0`),
    ];

    assert.deepEqual(
      responses.map((response) => response.status),
      [401, 401, 401, 401]
    );
  });
});
