import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import cookieParser from 'cookie-parser';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import { createRequireAuth } from './requireAuth.ts';
import { errorHandler } from './errorHandler.ts';
import { hashToken } from '../tokens.ts';
import { SESSION_COOKIE_NAME } from '../sessionCookie.ts';
import type { SessionRepository } from '../repositories/sessionRepository.ts';
import type { UserRepository } from '../repositories/userRepository.ts';
import type { PublicUser } from '../types/user.ts';

const USER: PublicUser = {
  id: 7,
  login: 'Bob',
  email: 'bob@example.com',
  firstName: 'Bob',
  lastName: 'Bobsson',
  status: 'active',
  createdAt: new Date(),
  updatedAt: new Date(),
};

const VALID = 'valid-token';

function deps(overrides: { userFound?: boolean } = {}) {
  const sessionRepository = {
    async findValidByTokenHash(tokenHash: string) {
      return tokenHash === hashToken(VALID)
        ? { id: 1, userId: USER.id, expiresAt: new Date(Date.now() + 1000) }
        : null;
    },
  } as SessionRepository;

  const userRepository = {
    async findById(_id: number) {
      return overrides.userFound === false ? null : USER;
    },
  } as UserRepository;

  return { sessionRepository, userRepository };
}

async function withServer(
  overrides: { userFound?: boolean },
  fn: (base: string) => Promise<void>
): Promise<void> {
  const app = express();
  app.use(cookieParser());
  app.get('/guarded', createRequireAuth(deps(overrides)), (req, res) => {
    res.json({ login: req.user?.login });
  });
  app.use(errorHandler);

  const server = app.listen(0);
  await once(server, 'listening');
  const { port } = server.address() as AddressInfo;
  try {
    await fn(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

const get = (base: string, cookie?: string) =>
  fetch(`${base}/guarded`, { headers: cookie ? { cookie } : {} });

test('a valid session cookie puts the user on the request', async () => {
  await withServer({}, async (base) => {
    const response = await get(base, `${SESSION_COOKIE_NAME}=${VALID}`);

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { login: 'Bob' });
  });
});

test('no cookie is 401', async () => {
  await withServer({}, async (base) => {
    assert.equal((await get(base)).status, 401);
  });
});

test('an unknown or expired token is 401', async () => {
  await withServer({}, async (base) => {
    const response = await get(base, `${SESSION_COOKIE_NAME}=bogus`);
    assert.equal(response.status, 401);
  });
});

test('a session whose user has been deleted is 401, not a crash', async () => {
  await withServer({ userFound: false }, async (base) => {
    assert.equal(
      (await get(base, `${SESSION_COOKIE_NAME}=${VALID}`)).status,
      401
    );
  });
});

test('the 401 body never says why, so it cannot confirm a token exists', async () => {
  await withServer({}, async (base) => {
    const missing = await (await get(base)).json();
    const bogus = await (
      await get(base, `${SESSION_COOKIE_NAME}=bogus`)
    ).json();

    assert.deepEqual(missing, bogus);
  });
});
