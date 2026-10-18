import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { createFakeBookRepository } from '../repositories/bookRepository.fake.testkit.ts';
import {
  createFakeUserRepository,
  type FakeUserRow,
} from '../repositories/userRepository.fake.testkit.ts';
import { createAuthRateLimits } from '../middleware/authRateLimit.ts';
import {
  json,
  ROLE_COOKIES,
  USER_IDS,
  withAuthenticatedApp,
} from './routeTestKit.testkit.ts';

// The three image upload PUTs (user avatar, book cover, series cover) share
// one budget per user id: 20 per 15 minutes. Driven through createApp, because
// only the app wiring shows the budget is shared across three routers.
const BUDGET = 20;

const userRow = (id: number, role: 'user' | 'author'): FakeUserRow => {
  const now = new Date();
  return {
    id,
    login: `persona-${id}`,
    email: `persona-${id}@example.com`,
    firstName: 'Persona',
    lastName: 'User',
    status: 'active',
    role,
    avatarUrl: null,
    about: '',
    showLastSeen: true,
    password: 'placeholder',
    createdAt: now,
    updatedAt: now,
  };
};

const aWebpImage = (): Promise<Buffer> =>
  sharp({
    create: { width: 100, height: 100, channels: 3, background: '#663399' },
  })
    .webp()
    .toBuffer();

async function withLimitedUploads(
  run: (base: string, bookId: number) => Promise<void>
): Promise<void> {
  const limits = createAuthRateLimits();
  const bookRepository = createFakeBookRepository({
    accounts: new Map([
      [
        USER_IDS.author,
        {
          id: USER_IDS.author,
          login: 'author',
          firstName: 'A',
          lastName: 'B',
          status: 'active',
          avatarUrl: null,
        },
      ],
    ]),
  });
  const book = await bookRepository.create({
    userId: USER_IDS.author,
    seriesId: null,
    title: 'T',
    description: 'x',
    tags: [],
  });
  try {
    await withAuthenticatedApp(
      {
        userRepository: createFakeUserRepository({
          seed: [
            userRow(USER_IDS.author, 'author'),
            userRow(USER_IDS.user, 'user'),
          ],
        }),
        bookRepository,
        authRateLimits: limits,
      },
      (base) => run(base, book.id)
    );
  } finally {
    limits.stop();
  }
}

async function put(
  url: string,
  cookie: string | undefined,
  body: Buffer
): Promise<Response> {
  return fetch(url, {
    method: 'PUT',
    headers: {
      'content-type': 'image/webp',
      ...(cookie ? { cookie } : {}),
    },
    body,
  });
}

const putAvatar = async (
  base: string,
  userId: number | string,
  cookie: string | undefined,
  body?: Buffer
): Promise<Response> =>
  put(
    `${base}/api/users/${userId}/avatar`,
    cookie,
    body ?? (await aWebpImage())
  );

const putCover = async (
  base: string,
  bookId: number,
  cookie: string | undefined,
  body?: Buffer
): Promise<Response> =>
  put(
    `${base}/api/books/${bookId}/cover`,
    cookie,
    body ?? (await aWebpImage())
  );

const putSeriesCover = async (
  base: string,
  seriesId: number,
  cookie: string | undefined
): Promise<Response> =>
  put(`${base}/api/series/${seriesId}/cover`, cookie, await aWebpImage());

async function spendBudget(base: string, cookie: string): Promise<void> {
  for (let i = 0; i < BUDGET; i += 1) {
    assert.equal((await putAvatar(base, USER_IDS.author, cookie)).status, 200);
  }
}

test("20 avatar PUTs pass, then the same user's book cover PUT is 429 with Retry-After", () =>
  withLimitedUploads(async (base, bookId) => {
    const as = ROLE_COOKIES.author;
    await spendBudget(base, as);

    const refused = await putCover(base, bookId, as);
    assert.equal(refused.status, 429);
    assert.match(refused.headers.get('retry-after') ?? '', /^\d+$/);
    assert.match(
      (await json<{ error: string }>(refused)).error,
      /^Too many attempts\. Try again in \d+ minutes?\.$/
    );
  }));

test('the budget is per user: another user still uploads', () =>
  withLimitedUploads(async (base) => {
    await spendBudget(base, ROLE_COOKIES.author);

    const other = await putAvatar(base, USER_IDS.user, ROLE_COOKIES.user);
    assert.equal(other.status, 200);
  }));

test('the 21st request is refused before the body is read', () =>
  withLimitedUploads(async (base) => {
    const as = ROLE_COOKIES.author;
    await spendBudget(base, as);

    const oversized = await putAvatar(
      base,
      USER_IDS.author,
      as,
      Buffer.alloc(2 * 1024 * 1024 + 1)
    );
    assert.equal(oversized.status, 429);
  }));

test('a malformed image spends budget', () =>
  withLimitedUploads(async (base) => {
    const as = ROLE_COOKIES.author;
    for (let i = 0; i < BUDGET; i += 1) {
      const response = await putAvatar(
        base,
        USER_IDS.author,
        as,
        Buffer.from('not an image')
      );
      assert.equal(response.status, 400);
    }

    assert.equal((await putAvatar(base, USER_IDS.author, as)).status, 429);
  }));

test('a request refused by validate spends nothing', () =>
  withLimitedUploads(async (base) => {
    const as = ROLE_COOKIES.author;
    for (let i = 0; i < BUDGET + 5; i += 1) {
      assert.equal((await putAvatar(base, 'abc', as)).status, 400);
    }

    await spendBudget(base, as);
  }));

test('a 403 from requirePermission spends nothing', () =>
  withLimitedUploads(async (base, bookId) => {
    const as = ROLE_COOKIES.user;
    // A plain user may not update a book, so each cover PUT is refused.
    for (let i = 0; i < BUDGET + 5; i += 1) {
      assert.equal((await putCover(base, bookId, as)).status, 403);
    }

    // The same user's own avatar is permitted, and the budget is untouched.
    assert.equal((await putAvatar(base, USER_IDS.user, as)).status, 200);
  }));

test('a guest PUT is 401 and spends nothing', () =>
  withLimitedUploads(async (base, bookId) => {
    assert.equal(
      (await putAvatar(base, USER_IDS.author, undefined)).status,
      401
    );
    assert.equal((await putCover(base, bookId, undefined)).status, 401);
    assert.equal((await putSeriesCover(base, 1, undefined)).status, 401);

    await spendBudget(base, ROLE_COOKIES.author);
  }));

test('DELETE avatar and DELETE cover stay unlimited after the budget is spent', () =>
  withLimitedUploads(async (base, bookId) => {
    const as = ROLE_COOKIES.author;
    await spendBudget(base, as);

    const avatar = await fetch(`${base}/api/users/${USER_IDS.author}/avatar`, {
      method: 'DELETE',
      headers: { cookie: as },
    });
    const cover = await fetch(`${base}/api/books/${bookId}/cover`, {
      method: 'DELETE',
      headers: { cookie: as },
    });
    assert.equal(avatar.status, 204);
    assert.equal(cover.status, 204);
  }));

test('the series cover PUT shares the budget', () =>
  withLimitedUploads(async (base) => {
    const as = ROLE_COOKIES.author;
    await spendBudget(base, as);

    assert.equal((await putSeriesCover(base, 1, as)).status, 429);
  }));
