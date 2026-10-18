import test, { type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import type { Request } from 'express';
import { LAST_ONLINE_WINDOW_MS } from 'shared';
import { resolveSessionUser } from './sessionUser.ts';
import { hashToken } from '../tokens.ts';
import { SESSION_COOKIE_NAME } from '../sessionCookie.ts';
import type { SessionRepository } from '../repositories/sessionRepository.ts';
import type { UserRepository } from '../repositories/userRepository.ts';

const NOW = new Date('2026-01-01T12:00:00Z');

function world(
  t: TestContext,
  user: { status: string; lastSeenAt: Date | null } | null
) {
  t.mock.timers.reset();
  t.mock.timers.enable({ apis: ['Date'], now: NOW });
  const touched: number[] = [];
  const lookups: string[] = [];
  const deps = {
    sessionRepository: {
      async findValidByTokenHash(hash: string) {
        return hash === hashToken('good')
          ? { id: 1, userId: 7, expiresAt: new Date(Date.now() + 1000) }
          : null;
      },
    } as SessionRepository,
    userRepository: {
      async findForAuth() {
        lookups.push('findForAuth');
        return user;
      },
      async findById() {
        lookups.push('findById');
        return user;
      },
      async touchLastSeen(id: number) {
        touched.push(id);
      },
    } as unknown as UserRepository,
  };
  const request = (cookie?: string) =>
    ({ cookies: cookie ? { [SESSION_COOKIE_NAME]: cookie } : {} }) as Request;
  return { deps, touched, lookups, request };
}

const ago = (ms: number) => new Date(NOW.getTime() - ms);

test('the auth path reads findForAuth and never findById', async (t) => {
  const { deps, lookups, request } = world(t, {
    status: 'active',
    lastSeenAt: null,
  });
  assert.ok(await resolveSessionUser(deps, request('good')));
  assert.deepEqual(lookups, ['findForAuth']);
});

test('a null lastSeenAt is stamped once', async (t) => {
  const { deps, touched, request } = world(t, {
    status: 'active',
    lastSeenAt: null,
  });
  await resolveSessionUser(deps, request('good'));
  assert.deepEqual(touched, [7]);
});

test('a stale lastSeenAt (window + 1 ms old) is stamped', async (t) => {
  const { deps, touched, request } = world(t, {
    status: 'active',
    lastSeenAt: ago(LAST_ONLINE_WINDOW_MS + 1),
  });
  await resolveSessionUser(deps, request('good'));
  assert.deepEqual(touched, [7]);
});

test('a lastSeenAt exactly the window old is not stamped', async (t) => {
  const { deps, touched, request } = world(t, {
    status: 'active',
    lastSeenAt: ago(LAST_ONLINE_WINDOW_MS),
  });
  await resolveSessionUser(deps, request('good'));
  assert.deepEqual(touched, []);
});

test('a fresh lastSeenAt is not stamped', async (t) => {
  const { deps, touched, request } = world(t, {
    status: 'active',
    lastSeenAt: ago(1000),
  });
  await resolveSessionUser(deps, request('good'));
  assert.deepEqual(touched, []);
});

test('a lastSeenAt in the future is not stamped', async (t) => {
  const { deps, touched, request } = world(t, {
    status: 'active',
    lastSeenAt: new Date(NOW.getTime() + 60_000),
  });
  await resolveSessionUser(deps, request('good'));
  assert.deepEqual(touched, []);
});

test('the resolved user carries no lastSeenAt', async (t) => {
  const { deps, request } = world(t, { status: 'active', lastSeenAt: null });
  const result = await resolveSessionUser(deps, request('good'));
  assert.equal('lastSeenAt' in (result ?? {}), false);
});

test('no cookie, an unknown token, a missing user and a blocked user stamp nothing', async (t) => {
  for (const [user, cookie] of [
    [{ status: 'active', lastSeenAt: null }, undefined],
    [{ status: 'active', lastSeenAt: null }, 'unknown'],
    [null, 'good'],
    [{ status: 'blocked', lastSeenAt: null }, 'good'],
  ] as const) {
    const { deps, touched, request } = world(t, user);
    assert.equal(await resolveSessionUser(deps, request(cookie)), null);
    assert.deepEqual(touched, []);
  }
});
