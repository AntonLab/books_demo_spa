import test from 'node:test';
import assert from 'node:assert/strict';
import type { UserRepository } from '../repositories/userRepository.ts';
import { createFakeUserRepository } from '../repositories/userRepository.fake.testkit.ts';
import type { AuthorSummary } from 'shared';
import type { ListAuthorsQuery } from '../types/user.ts';
import {
  json,
  ROLE_COOKIES,
  withApp,
  withAuthenticatedApp,
} from './routeTestKit.testkit.ts';

// On the `author` and `otherAuthor` personas' ids, so a session for either
// resolves to an author account.
const AUTHORS: AuthorSummary[] = [
  {
    id: 2,
    login: 'mhale',
    firstName: 'Margaret',
    lastName: 'Hale',
    avatarUrl: null,
  },
  {
    id: 5,
    login: 'ipetrov',
    firstName: 'Ivan',
    lastName: 'Petrov',
    avatarUrl: null,
  },
];

// The name matching and the blocked accounts it leaves out are the real
// repository's, covered against MySQL: the fake answers every author it holds.
// `queries` records what the route handed it.
function createFakeUsers(queries: ListAuthorsQuery[]): UserRepository {
  const now = new Date();
  return createFakeUserRepository({
    seed: AUTHORS.map((author) => ({
      ...author,
      email: `${author.login}@example.com`,
      status: 'active',
      role: 'author',
      // Never verified: nothing here signs in with a password.
      password: 'not-a-hash',
      createdAt: now,
      updatedAt: now,
    })),
    authorQueries: queries,
  });
}

test('a signed-in caller searches authors and gets no email back', async () => {
  const queries: ListAuthorsQuery[] = [];
  await withAuthenticatedApp(
    { userRepository: createFakeUsers(queries) },
    async (base) => {
      const response = await fetch(`${base}/api/authors?q=hale`, {
        headers: { cookie: ROLE_COOKIES.author },
      });

      assert.equal(response.status, 200);
      const body = await json<{ items: AuthorSummary[] }>(response);
      assert.deepEqual(body.items, AUTHORS);
      assert.deepEqual(queries, [{ q: 'hale', limit: 20 }]);
    }
  );
});

test('a plain user may search authors too', async () => {
  await withAuthenticatedApp(
    { userRepository: createFakeUsers([]) },
    async (base) => {
      const response = await fetch(`${base}/api/authors`, {
        headers: { cookie: ROLE_COOKIES.user },
      });
      assert.equal(response.status, 200);
    }
  );
});

test('the author search is closed to a guest', async () => {
  await withApp({ userRepository: createFakeUsers([]) }, async (base) => {
    assert.equal((await fetch(`${base}/api/authors?q=hale`)).status, 401);
  });
});

test('an author with an Avatar is listed with its avatarUrl, not null', async () => {
  const repository = createFakeUsers([]);
  await repository.setAvatar(AUTHORS[0]!.id, Buffer.from('a'));

  await withAuthenticatedApp({ userRepository: repository }, async (base) => {
    const response = await fetch(`${base}/api/authors?q=hale`, {
      headers: { cookie: ROLE_COOKIES.author },
    });

    assert.equal(response.status, 200);
    const body = await json<{ items: AuthorSummary[] }>(response);
    assert.match(
      body.items[0]?.avatarUrl ?? '',
      new RegExp(`^/api/users/${AUTHORS[0]!.id}/avatar\\?v=\\d+$`)
    );
  });
});

test('an over-long limit is a 400', async () => {
  await withAuthenticatedApp(
    { userRepository: createFakeUsers([]) },
    async (base) => {
      const response = await fetch(`${base}/api/authors?limit=500`, {
        headers: { cookie: ROLE_COOKIES.author },
      });
      assert.equal(response.status, 400);
    }
  );
});
