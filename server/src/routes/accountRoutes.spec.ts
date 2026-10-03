import test from 'node:test';
import assert from 'node:assert/strict';
import type { AccountProfile } from 'shared';
import { createFakeAccountRepository } from '../repositories/accountRepository.fake.testkit.ts';
import { AUTH_COOKIE, json, withApp } from './routeTestKit.testkit.ts';

const PROFILE: AccountProfile = {
  id: 42,
  firstName: 'Ada',
  lastName: 'Writer',
  avatarUrl: null,
  about: 'Hello',
  lastSeenAt: new Date('2026-06-01T12:00:00Z'),
  bookCount: 2,
  seriesCount: 1,
  totals: {
    booksInReadingLists: 3,
    seriesInReadingLists: 1,
    bookLikes: 5,
    seriesLikes: 6,
    commentsOnBooks: 7,
    favorites: 8,
  },
};

const withProfiles = (fn: (base: string) => Promise<void>) =>
  withApp(
    { accountRepository: createFakeAccountRepository({ profiles: [PROFILE] }) },
    fn
  );

test('a Guest reads a profile, and the body holds exactly the profile fields', async () => {
  await withProfiles(async (base) => {
    const response = await fetch(`${base}/api/accounts/42`);
    const body = await json<Record<string, unknown>>(response);

    assert.equal(response.status, 200);
    assert.deepEqual(Object.keys(body).sort(), Object.keys(PROFILE).sort());
    assert.equal(body.lastSeenAt, '2026-06-01T12:00:00.000Z');
    for (const leaked of ['email', 'login', 'role', 'status', 'password']) {
      assert.equal(leaked in body, false);
    }
  });
});

test('a signed-in caller gets the same answer, and a session is not required', async () => {
  await withProfiles(async (base) => {
    const response = await fetch(`${base}/api/accounts/42`, {
      headers: { cookie: AUTH_COOKIE },
    });
    assert.equal(response.status, 200);
  });
});

test('an id the repository does not know, or hides, is 404', async () => {
  await withProfiles(async (base) => {
    const response = await fetch(`${base}/api/accounts/43`);
    assert.equal(response.status, 404);
  });
});

test('an id that is not a positive integer is 400', async () => {
  await withProfiles(async (base) => {
    for (const id of ['abc', '0', '-1', '1.5']) {
      const response = await fetch(`${base}/api/accounts/${id}`);
      assert.equal(response.status, 400, id);
    }
  });
});
