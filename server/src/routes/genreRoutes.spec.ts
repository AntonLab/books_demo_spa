import test from 'node:test';
import assert from 'node:assert/strict';
import { createFakeGenreRepository } from '../repositories/genreRepository.fake.testkit.ts';
import type { PublicGenre } from 'shared';
import { GENRE_NAME_MAX_LENGTH } from 'shared';
import {
  json,
  ROLE_COOKIES,
  withApp,
  withAuthenticatedApp,
} from './routeTestKit.testkit.ts';

// Only `admin` and `superadmin` hold anything but `none` on writing genres,
// so `admin` is the default caller for every write here.
const post = (
  base: string,
  body: unknown,
  cookie: string | null = ROLE_COOKIES.admin
) =>
  fetch(`${base}/api/genres`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(cookie ? { cookie } : {}),
    },
    body: JSON.stringify(body),
  });

const patch = (
  base: string,
  id: number,
  body: unknown,
  cookie: string | null = ROLE_COOKIES.admin
) =>
  fetch(`${base}/api/genres/${id}`, {
    method: 'PATCH',
    headers: {
      'content-type': 'application/json',
      ...(cookie ? { cookie } : {}),
    },
    body: JSON.stringify(body),
  });

const remove = (
  base: string,
  id: number,
  cookie: string | null = ROLE_COOKIES.admin
) =>
  fetch(`${base}/api/genres/${id}`, {
    method: 'DELETE',
    headers: { ...(cookie ? { cookie } : {}) },
  });

test('GET is open to a guest and lists every genre alphabetically', async () => {
  await withApp(
    {
      genreRepository: createFakeGenreRepository({
        seeds: [
          { id: 1, name: 'Horror' },
          { id: 2, name: 'gothic' },
        ],
      }),
    },
    async (base) => {
      const response = await fetch(`${base}/api/genres`);
      const body = await json<{ items: PublicGenre[] }>(response);

      assert.equal(response.status, 200);
      assert.deepEqual(
        body.items.map((genre) => genre.name),
        ['gothic', 'Horror']
      );
      // No paging envelope: the list comes back whole.
      assert.equal('total' in body, false);
    }
  );
});

test('GET hands nonEmpty to the repository and refuses a value that is not a boolean', async () => {
  const listCalls: { nonEmpty: boolean }[] = [];
  await withApp(
    {
      genreRepository: createFakeGenreRepository({
        seeds: [{ id: 1, name: 'Horror' }],
        listCalls,
      }),
    },
    async (base) => {
      assert.equal(
        (await fetch(`${base}/api/genres?nonEmpty=true`)).status,
        200
      );
      assert.equal((await fetch(`${base}/api/genres`)).status, 200);
      assert.equal((await fetch(`${base}/api/genres?nonEmpty=1`)).status, 200);
      assert.equal(
        (await fetch(`${base}/api/genres?nonEmpty=maybe`)).status,
        400
      );
    }
  );
  assert.deepEqual(listCalls, [
    { nonEmpty: true },
    { nonEmpty: false },
    { nonEmpty: true },
  ]);
});

const get = (base: string, query: string, cookie: string | null = null) =>
  fetch(`${base}/api/genres${query}`, { headers: cookie ? { cookie } : {} });

test('GET with both ?counts=1 and ?nonEmpty=1 answers with counts and never asks for nonEmpty', async () => {
  const listCalls: { nonEmpty: boolean }[] = [];
  await withAuthenticatedApp(
    {
      genreRepository: createFakeGenreRepository({
        seeds: [{ id: 1, name: 'Fantasy' }],
        counts: new Map([[1, { bookCount: 2, seriesCount: 1 }]]),
        listCalls,
      }),
    },
    async (base) => {
      const response = await get(
        base,
        '?counts=1&nonEmpty=1',
        ROLE_COOKIES.admin
      );
      assert.equal(response.status, 200);
      assert.deepEqual((await json<{ items: unknown[] }>(response)).items, [
        {
          id: 1,
          name: 'Fantasy',
          parentId: null,
          bookCount: 2,
          seriesCount: 1,
        },
      ]);
    }
  );
  assert.deepEqual(listCalls, []);
});

test('POST creates a Subgenre, and a missing, nested or self parent is 400 on parentId', async () => {
  await withAuthenticatedApp(
    {
      genreRepository: createFakeGenreRepository({
        seeds: [
          { id: 1, name: 'Fantasy' },
          { id: 2, name: 'Urban', parentId: 1 },
        ],
      }),
    },
    async (base) => {
      const created = await post(base, { name: 'Epic', parentId: 1 });
      assert.equal(created.status, 201);
      assert.deepEqual((await json<PublicGenre>(created)).parent, {
        id: 1,
        name: 'Fantasy',
      });

      for (const parentId of [999, 2]) {
        const bad = await post(base, { name: 'X', parentId });
        assert.equal(bad.status, 400);
        const { details } = await json<{ details: { path: string[] }[] }>(bad);
        assert.deepEqual(details[0]?.path, ['parentId']);
      }
      assert.equal((await post(base, { name: 'X', parentId: 0 })).status, 400);
      assert.equal(
        (await post(base, { name: 'X', parentId: 'a' })).status,
        400
      );
    }
  );
});

test('PATCH moves and promotes, refuses {} with 400, and a sibling collision is 409 with its message', async () => {
  await withAuthenticatedApp(
    {
      genreRepository: createFakeGenreRepository({
        seeds: [
          { id: 1, name: 'Fantasy' },
          { id: 2, name: 'Horror' },
          { id: 3, name: 'Gothic', parentId: 1 },
          { id: 4, name: 'gothic', parentId: 2 },
        ],
      }),
    },
    async (base) => {
      assert.equal((await patch(base, 3, {})).status, 400);
      const collided = await patch(base, 3, { parentId: 2 });
      assert.equal(collided.status, 409);
      const body = await json<{ error: string; details: unknown }>(collided);
      assert.equal(body.error, 'A genre with this name already exists here.');
      assert.deepEqual(body.details, { field: 'name' });

      const promoted = await patch(base, 3, { parentId: null });
      assert.equal(promoted.status, 200);
      assert.equal((await json<PublicGenre>(promoted)).parent, null);
      assert.equal((await patch(base, 1, { parentId: 2 })).status, 200);
    }
  );
});

test('DELETE of a Genre with a Subgenre is 409 and says to move or delete the Subgenres first', async () => {
  await withAuthenticatedApp(
    {
      genreRepository: createFakeGenreRepository({
        seeds: [
          { id: 1, name: 'Fantasy' },
          { id: 2, name: 'Urban', parentId: 1 },
        ],
      }),
    },
    async (base) => {
      const refused = await remove(base, 1);
      assert.equal(refused.status, 409);
      assert.match(
        (await json<{ error: string }>(refused)).error,
        /move or delete its subgenres first/i
      );
      assert.equal((await remove(base, 2)).status, 204);
      assert.equal((await remove(base, 1)).status, 204);
    }
  );
});

test('GET ?counts=1 is for an admin only: guest 401, user and author 403, admin 200 with counts', async () => {
  await withAuthenticatedApp(
    {
      genreRepository: createFakeGenreRepository({
        seeds: [{ id: 1, name: 'Fantasy' }],
        counts: new Map([[1, { bookCount: 2, seriesCount: 1 }]]),
      }),
    },
    async (base) => {
      assert.equal((await get(base, '?counts=1')).status, 401);
      assert.equal(
        (await get(base, '?counts=1', ROLE_COOKIES.user)).status,
        403
      );
      assert.equal(
        (await get(base, '?counts=1', ROLE_COOKIES.author)).status,
        403
      );
      const ok = await get(base, '?counts=1', ROLE_COOKIES.admin);
      assert.equal(ok.status, 200);
      assert.deepEqual((await json<{ items: unknown[] }>(ok)).items, [
        {
          id: 1,
          name: 'Fantasy',
          parentId: null,
          bookCount: 2,
          seriesCount: 1,
        },
      ]);
      assert.equal(
        (await get(base, '?counts=1', ROLE_COOKIES.superadmin)).status,
        200
      );
      assert.equal(
        (await get(base, '?counts=maybe', ROLE_COOKIES.admin)).status,
        400
      );
    }
  );
});

test('POST adds a genre for an admin and for a superadmin', async () => {
  await withAuthenticatedApp(
    { genreRepository: createFakeGenreRepository() },
    async (base) => {
      const byAdmin = await post(base, { name: '  Gothic  ' });
      const bySuperadmin = await post(
        base,
        { name: 'Hard SF' },
        ROLE_COOKIES.superadmin
      );

      assert.equal(byAdmin.status, 201);
      // Trimmed on the way in, so the stored name is what a list shows.
      assert.equal((await json<PublicGenre>(byAdmin)).name, 'Gothic');
      assert.equal(bySuperadmin.status, 201);
    }
  );
});

test('a write with no session is 401, and one from a user or an author 403', async () => {
  await withAuthenticatedApp(
    {
      genreRepository: createFakeGenreRepository({
        seeds: [{ id: 1, name: 'Gothic' }],
      }),
    },
    async (base) => {
      assert.equal((await post(base, { name: 'X' }, null)).status, 401);
      assert.equal((await patch(base, 1, { name: 'X' }, null)).status, 401);
      assert.equal((await remove(base, 1, null)).status, 401);

      for (const cookie of [ROLE_COOKIES.user, ROLE_COOKIES.author]) {
        assert.equal((await post(base, { name: 'X' }, cookie)).status, 403);
        assert.equal((await patch(base, 1, { name: 'X' }, cookie)).status, 403);
        assert.equal((await remove(base, 1, cookie)).status, 403);
      }
    }
  );
});

test('POST refuses a name already taken in any case with 409', async () => {
  await withAuthenticatedApp(
    {
      genreRepository: createFakeGenreRepository({
        seeds: [{ id: 1, name: 'Gothic' }],
      }),
    },
    async (base) => {
      const response = await post(base, { name: 'gothic' });

      assert.equal(response.status, 409);
      assert.deepEqual((await json<{ details: unknown }>(response)).details, {
        field: 'name',
      });
    }
  );
});

test('POST refuses a blank name and one over the limit with 400', async () => {
  await withAuthenticatedApp(
    { genreRepository: createFakeGenreRepository() },
    async (base) => {
      assert.equal((await post(base, { name: '   ' })).status, 400);
      assert.equal(
        (await post(base, { name: 'g'.repeat(GENRE_NAME_MAX_LENGTH + 1) }))
          .status,
        400
      );
      assert.equal(
        (await post(base, { name: 'g'.repeat(GENRE_NAME_MAX_LENGTH) })).status,
        201
      );
    }
  );
});

test('PATCH renames a genre, and answers 404 for an unknown id', async () => {
  await withAuthenticatedApp(
    {
      genreRepository: createFakeGenreRepository({
        seeds: [{ id: 1, name: 'Hard SF' }],
      }),
    },
    async (base) => {
      const renamed = await patch(base, 1, { name: 'hard sf' });

      assert.equal(renamed.status, 200);
      assert.equal((await json<PublicGenre>(renamed)).name, 'hard sf');
      assert.equal((await patch(base, 999, { name: 'X' })).status, 404);
    }
  );
});

test('DELETE answers 204, and 404 for an unknown id', async () => {
  await withAuthenticatedApp(
    {
      genreRepository: createFakeGenreRepository({
        seeds: [{ id: 1, name: 'Gothic' }],
      }),
    },
    async (base) => {
      assert.equal((await remove(base, 1)).status, 204);
      assert.equal((await remove(base, 1)).status, 404);
      assert.equal((await remove(base, 999)).status, 404);
    }
  );
});
