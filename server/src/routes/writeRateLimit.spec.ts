import test from 'node:test';
import assert from 'node:assert/strict';
import { createAuthRateLimits } from '../middleware/authRateLimit.ts';
import { ROLE_COOKIES, withAuthenticatedApp } from './routeTestKit.testkit.ts';

// Comment, like, report and chapter writes share one budget per user id: 60
// per 15 minutes. Driven through createApp, because only the app wiring shows
// the budget is shared across four routers. Every request below is invalid, so
// validate answers 400 before any repository is touched; a 429 comes first.
const BUDGET = 60;

const WRITES: Array<[method: string, path: string]> = [
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
];

async function withLimitedWrites(
  run: (base: string) => Promise<void>
): Promise<void> {
  const limits = createAuthRateLimits();
  try {
    await withAuthenticatedApp({ authRateLimits: limits }, run);
  } finally {
    limits.stop();
  }
}

const send = (
  base: string,
  method: string,
  path: string,
  cookie?: string
): Promise<Response> =>
  fetch(`${base}${path}`, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(cookie ? { cookie } : {}),
    },
    ...(method === 'GET' || method === 'DELETE' ? {} : { body: '{}' }),
  });

async function spendBudget(
  base: string,
  cookie: string,
  [method, path]: [string, string] = ['POST', '/api/likes']
): Promise<void> {
  for (let i = 0; i < BUDGET; i += 1) {
    assert.equal((await send(base, method, path, cookie)).status, 400);
  }
}

test('60 writes across comments, likes, reports and chapters pass, the 61st on any route is 429 with Retry-After', () =>
  withLimitedWrites(async (base) => {
    const as = ROLE_COOKIES.author;
    for (let i = 0; i < BUDGET; i += 1) {
      const [method, path] = WRITES[i % WRITES.length]!;
      assert.equal((await send(base, method, path, as)).status, 400);
    }

    for (const [method, path] of WRITES) {
      const refused = await send(base, method, path, as);
      assert.equal(refused.status, 429, `${method} ${path}`);
      assert.match(refused.headers.get('retry-after') ?? '', /^\d+$/);
    }
  }));

test('the budget is per user', () =>
  withLimitedWrites(async (base) => {
    await spendBudget(base, ROLE_COOKIES.author);

    const other = await send(base, 'POST', '/api/likes', ROLE_COOKIES.admin);
    assert.equal(other.status, 400);
  }));

test('reads and unauthenticated writes never spend it', () =>
  withLimitedWrites(async (base) => {
    for (let i = 0; i < 100; i += 1) {
      assert.equal((await send(base, 'POST', '/api/comments')).status, 401);
    }
    await spendBudget(base, ROLE_COOKIES.author);

    assert.equal(
      (await send(base, 'GET', '/api/comments?limit=abc', ROLE_COOKIES.author))
        .status,
      400
    );
    assert.equal((await send(base, 'POST', '/api/comments')).status, 401);
  }));

test('moderator report actions share the budget', () =>
  withLimitedWrites(async (base) => {
    const as = ROLE_COOKIES.admin;
    const take: [string, string] = ['POST', '/api/reports/abc/take'];
    await spendBudget(base, as, take);

    assert.equal((await send(base, ...take, as)).status, 429);
  }));

test('illustration routes keep their own limiter', () =>
  withLimitedWrites(async (base) => {
    const as = ROLE_COOKIES.author;
    await spendBudget(base, as);

    const reorder = await send(
      base,
      'PUT',
      '/api/chapters/abc/illustration-order',
      as
    );
    assert.equal(reorder.status, 400);
  }));
