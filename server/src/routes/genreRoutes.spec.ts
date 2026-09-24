import test from 'node:test';
import assert from 'node:assert/strict';
import { createFakeGenreRepository } from '../repositories/genreRepository.fake.testkit.ts';
import { GENRE_NAME_MAX_LENGTH, type PublicGenre } from '../types/genre.ts';
import {
  json,
  ROLE_COOKIES,
  withApp,
  withAuthenticatedApp,
} from './routeTestKit.testkit.ts';

// Only `admin` and `superadmin` hold anything but `none` on writing genres
// (R1), so `admin` is the default caller for every write here.
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
      // No paging envelope: A1 returns the list whole.
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
      assert.equal(
        (await fetch(`${base}/api/genres?nonEmpty=maybe`)).status,
        400
      );
    }
  );
  assert.deepEqual(listCalls, [{ nonEmpty: true }, { nonEmpty: false }]);
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
