import test from 'node:test';
import assert from 'node:assert/strict';
import { createAuthRateLimits } from '../middleware/authRateLimit.ts';
import type { AppDeps } from '../app.ts';
import { ROLE_COOKIES, withAuthenticatedApp } from './routeTestKit.testkit.ts';

// Comment, like, report, chapter and reading-progress writes share one budget
// per user id: 60 per 15 minutes. Driven through createApp, because only the
// app wiring shows the budget is shared across five routers. The limiter sits
// after validate, so only a request that passes validation spends budget:
// INVALID answers 400 and costs nothing, VALID reaches a repository and costs
// one.
const BUDGET = 60;

type Write = [method: string, path: string, body?: unknown];

const INVALID: Write[] = [
  ['POST', '/api/comments'],
  ['PATCH', '/api/comments/abc'],
  ['DELETE', '/api/comments/abc'],
  ['POST', '/api/comments/abc/restore'],
  ['POST', '/api/likes'],
  ['PATCH', '/api/likes/abc'],
  ['DELETE', '/api/likes/abc'],
  ['POST', '/api/comments/abc/report'],
  ['POST', '/api/chapters'],
  ['PATCH', '/api/chapters/abc'],
  ['DELETE', '/api/chapters/abc'],
  ['POST', '/api/books/abc/reading-progress'],
];

const VALID: Write[] = [
  ['POST', '/api/comments', { bookId: 1, text: 'x' }],
  ['PATCH', '/api/comments/1', { text: 'x' }],
  ['DELETE', '/api/comments/1'],
  ['POST', '/api/comments/1/restore'],
  ['POST', '/api/likes', { bookId: 1, isLike: true }],
  ['PATCH', '/api/likes/1', { isLike: true }],
  ['DELETE', '/api/likes/1'],
  ['POST', '/api/comments/1/report', { reason: 'spam' }],
  ['POST', '/api/chapters', { bookId: 1, title: 't', text: 'x' }],
  [
    'PATCH',
    '/api/chapters/1',
    { title: 't', expectedUpdatedAt: '2026-01-01T00:00:00Z' },
  ],
  ['DELETE', '/api/chapters/1'],
  ['POST', '/api/books/1/reading-progress', { event: 'opened', chapterId: 1 }],
];

const TAKE: Write = ['POST', '/api/reports/1/take'];
const LIKE: Write = VALID[4]!;

// Every method answers null: a valid write gets past validate and the
// repository call ends it with a refusal, which still counts against the
// budget.
const emptyRepository = <T>(): T =>
  new Proxy(
    {},
    { get: (_target, key) => (key === 'then' ? undefined : async () => null) }
  ) as T;

const emptyRepositories = (): Partial<AppDeps> => ({
  commentRepository: emptyRepository(),
  likeRepository: emptyRepository(),
  reportRepository: emptyRepository(),
  chapterRepository: emptyRepository(),
  libraryRepository: emptyRepository(),
});

async function withLimitedWrites(
  run: (base: string) => Promise<void>
): Promise<void> {
  const limits = createAuthRateLimits();
  try {
    await withAuthenticatedApp(
      { ...emptyRepositories(), authRateLimits: limits },
      run
    );
  } finally {
    limits.stop();
  }
}

const send = (
  base: string,
  [method, path, body = {}]: Write,
  cookie?: string
): Promise<Response> =>
  fetch(`${base}${path}`, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(cookie ? { cookie } : {}),
    },
    ...(method === 'GET' || method === 'DELETE'
      ? {}
      : { body: JSON.stringify(body) }),
  });

const spends = (response: Response): boolean =>
  response.status !== 400 && response.status !== 429;

async function spendBudget(
  base: string,
  cookie: string,
  write: Write = LIKE
): Promise<void> {
  for (let i = 0; i < BUDGET; i += 1) {
    const response = await send(base, write, cookie);
    assert.ok(spends(response), `${write[1]} answered ${response.status}`);
  }
}

test('60 writes across comments, likes, reports, chapters and reading progress pass, the 61st on any route is 429 with Retry-After', () =>
  withLimitedWrites(async (base) => {
    const as = ROLE_COOKIES.author;
    for (let i = 0; i < BUDGET; i += 1) {
      const write = VALID[i % VALID.length]!;
      const response = await send(base, write, as);
      assert.ok(spends(response), `${write[1]} answered ${response.status}`);
    }

    for (const write of VALID) {
      const refused = await send(base, write, as);
      assert.equal(refused.status, 429, `${write[0]} ${write[1]}`);
      assert.match(refused.headers.get('retry-after') ?? '', /^\d+$/);
    }
  }));

test('invalid requests do not spend the budget', () =>
  withLimitedWrites(async (base) => {
    const as = ROLE_COOKIES.author;
    for (let i = 0; i < BUDGET + 1; i += 1) {
      const [method, path] = INVALID[i % INVALID.length]!;
      assert.equal((await send(base, [method, path], as)).status, 400);
    }

    await spendBudget(base, as);
    assert.equal((await send(base, LIKE, as)).status, 429);
  }));

test('the budget is per user', () =>
  withLimitedWrites(async (base) => {
    await spendBudget(base, ROLE_COOKIES.author);

    const other = await send(base, LIKE, ROLE_COOKIES.admin);
    assert.ok(spends(other));
  }));

test('reads and unauthenticated writes never spend it', () =>
  withLimitedWrites(async (base) => {
    for (let i = 0; i < 100; i += 1) {
      assert.equal((await send(base, ['POST', '/api/comments'])).status, 401);
      assert.equal(
        (
          await send(
            base,
            ['GET', '/api/comments?limit=abc'],
            ROLE_COOKIES.author
          )
        ).status,
        400
      );
    }

    await spendBudget(base, ROLE_COOKIES.author);
    assert.equal((await send(base, ['POST', '/api/comments'])).status, 401);
  }));

test('moderator report actions share the budget', () =>
  withLimitedWrites(async (base) => {
    const as = ROLE_COOKIES.admin;
    await spendBudget(base, as, TAKE);

    assert.equal((await send(base, TAKE, as)).status, 429);
  }));

test('illustration routes keep their own limiter', () =>
  withLimitedWrites(async (base) => {
    const as = ROLE_COOKIES.author;
    await spendBudget(base, as);

    const reorder = await send(
      base,
      ['PUT', '/api/chapters/abc/illustration-order'],
      as
    );
    assert.equal(reorder.status, 400);
  }));
