import test from 'node:test';
import assert from 'node:assert/strict';
import type { Request } from 'express';
import type { PublicUser } from 'shared';
import { resolveSessionUser } from './sessionUser.ts';
import { hashToken } from '../tokens.ts';
import { SESSION_COOKIE_NAME } from '../sessionCookie.ts';
import type { SessionRepository } from '../repositories/sessionRepository.ts';
import type { UserRepository } from '../repositories/userRepository.ts';

function world(user: Pick<PublicUser, 'status'> | null) {
  const touched: number[] = [];
  const deps = {
    sessionRepository: {
      async findValidByTokenHash(hash: string) {
        return hash === hashToken('good')
          ? { id: 1, userId: 7, expiresAt: new Date(Date.now() + 1000) }
          : null;
      },
    } as SessionRepository,
    userRepository: {
      async findById() {
        return user as PublicUser | null;
      },
      async touchLastSeen(id: number) {
        touched.push(id);
      },
    } as unknown as UserRepository,
  };
  const request = (cookie?: string) =>
    ({ cookies: cookie ? { [SESSION_COOKIE_NAME]: cookie } : {} }) as Request;
  return { deps, touched, request };
}

test('a valid session stamps its Account once', async () => {
  const { deps, touched, request } = world({ status: 'active' });
  assert.ok(await resolveSessionUser(deps, request('good')));
  assert.deepEqual(touched, [7]);
});

test('no cookie, an unknown token, a missing user and a blocked user stamp nothing', async () => {
  for (const [user, cookie] of [
    [{ status: 'active' }, undefined],
    [{ status: 'active' }, 'unknown'],
    [null, 'good'],
    [{ status: 'blocked' }, 'good'],
  ] as const) {
    const { deps, touched, request } = world(user);
    assert.equal(await resolveSessionUser(deps, request(cookie)), null);
    assert.deepEqual(touched, []);
  }
});
