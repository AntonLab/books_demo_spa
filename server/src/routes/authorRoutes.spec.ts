import test from 'node:test';
import assert from 'node:assert/strict';
import type { UserRepository } from '../repositories/userRepository.ts';
import type { AuthorSummary, ListAuthorsQuery } from '../types/user.ts';
import {
  json,
  ROLE_COOKIES,
  withApp,
  withAuthenticatedApp,
} from './routeTestKit.testkit.ts';

const AUTHORS: AuthorSummary[] = [
  { id: 2, login: 'mhale', firstName: 'Margaret', lastName: 'Hale' },
  { id: 5, login: 'ipetrov', firstName: 'Ivan', lastName: 'Petrov' },
];

// Only the search is faked: which accounts count as authors, and the name
// matching, are the real repository's, covered against MySQL. `queries`
// records what the route handed it.
function createFakeUsers(queries: ListAuthorsQuery[]): UserRepository {
  return {
    async listAuthors(query: ListAuthorsQuery) {
      queries.push(query);
      return AUTHORS;
    },
    async findById() {
      return null;
    },
  } as unknown as UserRepository;
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
