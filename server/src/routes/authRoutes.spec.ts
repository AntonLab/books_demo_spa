import test from 'node:test';
import assert from 'node:assert/strict';
import { withApp, json } from './routeTestKit.testkit.ts';
import { hashPassword } from '../password.ts';
import { hashToken } from '../tokens.ts';
import { SESSION_COOKIE_NAME } from '../sessionCookie.ts';
import { ConflictError } from '../types/errors.ts';
import type {
  SessionRepository,
  SessionRecord,
} from '../repositories/sessionRepository.ts';
import type { UserRepository } from '../repositories/userRepository.ts';
import type { CreateUserInput, PublicUser, UserStatus } from '../types/user.ts';

const registration = {
  login: 'Bob',
  email: 'bob@example.com',
  password: 'hunter2hunter2',
  firstName: 'Bob',
  lastName: 'Bobsson',
};

// A fake user store carrying the one thing PublicUser deliberately omits.
function createFakeUsers(seed: { status?: UserStatus } = {}) {
  const rows = new Map<number, PublicUser & { password: string }>();
  let nextId = 1;

  const repository = {
    async create(input: CreateUserInput) {
      if ([...rows.values()].some((row) => row.login === input.login)) {
        throw new ConflictError('login');
      }
      if ([...rows.values()].some((row) => row.email === input.email)) {
        throw new ConflictError('email');
      }
      const now = new Date();
      const row = {
        id: nextId,
        login: input.login,
        email: input.email,
        firstName: input.firstName,
        lastName: input.lastName,
        status: input.status ?? 'pending',
        password: await hashPassword(input.password, 'test'),
        createdAt: now,
        updatedAt: now,
      };
      nextId += 1;
      rows.set(row.id, row);
      const { password: _password, ...publicUser } = row;
      return publicUser;
    },

    async findById(id: number) {
      const row = rows.get(id);
      if (!row) return null;
      const { password: _password, ...publicUser } = row;
      return publicUser;
    },

    async findByLoginWithPassword(login: string) {
      const row = [...rows.values()].find(
        (candidate) => candidate.login === login
      );
      return row
        ? {
            id: row.id,
            password: row.password,
            status: seed.status ?? row.status,
          }
        : null;
    },

    async findByEmail(email: string) {
      const row = [...rows.values()].find(
        (candidate) => candidate.email === email
      );
      if (!row) return null;
      const { password: _password, ...publicUser } = row;
      return publicUser;
    },
  } as unknown as UserRepository;

  return repository;
}

function createFakeSessions() {
  const rows = new Map<string, SessionRecord>();
  let nextId = 1;

  const repository: SessionRepository = {
    async create(userId, tokenHash, expiresAt) {
      const record = { id: nextId, userId, expiresAt };
      nextId += 1;
      rows.set(tokenHash, record);
      return record;
    },
    async findValidByTokenHash(tokenHash) {
      const record = rows.get(tokenHash);
      return record && record.expiresAt > new Date() ? record : null;
    },
    async deleteByTokenHash(tokenHash) {
      return rows.delete(tokenHash);
    },
    async deleteAllForUser(userId) {
      let removed = 0;
      for (const [hash, record] of rows) {
        if (record.userId === userId) {
          rows.delete(hash);
          removed += 1;
        }
      }
      return removed;
    },
  };

  return { repository, rows };
}

function authDeps(seed: { status?: UserStatus } = {}) {
  const sessions = createFakeSessions();
  return {
    deps: {
      userRepository: createFakeUsers(seed),
      sessionRepository: sessions.repository,
    },
    sessions,
  };
}

const post = (base: string, path: string, body: unknown, cookie?: string) =>
  fetch(`${base}/api/auth/${path}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(cookie ? { cookie } : {}),
    },
    body: JSON.stringify(body),
  });

// Reads the token out of Set-Cookie so tests can replay it as a request cookie.
function sessionCookie(response: Response): string | null {
  const header = response.headers.get('set-cookie');
  const match = header?.match(new RegExp(`${SESSION_COOKIE_NAME}=([^;]+)`));
  return match?.[1] ?? null;
}

test('POST /register creates the user and opens a session', async () => {
  const { deps } = authDeps();
  await withApp(deps, async (base) => {
    const response = await post(base, 'register', registration);
    const body = await json<PublicUser>(response);

    assert.equal(response.status, 201);
    assert.equal(body.login, 'Bob');
    assert.ok(sessionCookie(response));
  });
});

test('POST /register activates the account, since nothing else can clear pending', async () => {
  const { deps } = authDeps();
  await withApp(deps, async (base) => {
    const body = await json<PublicUser>(
      await post(base, 'register', registration)
    );

    assert.equal(body.status, 'active');
  });
});

test('POST /register never returns the password hash', async () => {
  const { deps } = authDeps();
  await withApp(deps, async (base) => {
    const body = await json<Record<string, unknown>>(
      await post(base, 'register', registration)
    );

    assert.equal('password' in body, false);
  });
});

test('POST /register reports which field collided', async () => {
  const { deps } = authDeps();
  await withApp(deps, async (base) => {
    await post(base, 'register', registration);
    const response = await post(base, 'register', {
      ...registration,
      email: 'other@example.com',
    });

    assert.equal(response.status, 409);
    assert.deepEqual((await json<{ details: unknown }>(response)).details, {
      field: 'login',
    });
  });
});

test('the session cookie is httpOnly and same-site lax', async () => {
  const { deps } = authDeps();
  await withApp(deps, async (base) => {
    const header = (await post(base, 'register', registration)).headers.get(
      'set-cookie'
    );

    assert.match(header ?? '', /HttpOnly/i);
    assert.match(header ?? '', /SameSite=Lax/i);
  });
});

test('POST /login returns the user and a session cookie', async () => {
  const { deps } = authDeps();
  await withApp(deps, async (base) => {
    await post(base, 'register', registration);
    const response = await post(base, 'login', {
      login: 'Bob',
      password: 'hunter2hunter2',
    });

    assert.equal(response.status, 200);
    assert.ok(sessionCookie(response));
  });
});

test('POST /login stores only the hash of the session token', async () => {
  const { deps, sessions } = authDeps();
  await withApp(deps, async (base) => {
    const response = await post(base, 'register', registration);
    const token = sessionCookie(response);
    assert.ok(token);

    assert.equal(sessions.rows.has(token), false);
    assert.ok(sessions.rows.has(hashToken(decodeURIComponent(token))));
  });
});

test('POST /login issues a new session rather than reusing the old one', async () => {
  const { deps } = authDeps();
  await withApp(deps, async (base) => {
    const first = sessionCookie(await post(base, 'register', registration));
    const second = sessionCookie(
      await post(base, 'login', { login: 'Bob', password: 'hunter2hunter2' })
    );

    assert.notEqual(first, second);
  });
});

test('a wrong password and an unknown login are indistinguishable', async () => {
  const { deps } = authDeps();
  await withApp(deps, async (base) => {
    await post(base, 'register', registration);

    const wrong = await post(base, 'login', {
      login: 'Bob',
      password: 'wrongpassword',
    });
    const unknown = await post(base, 'login', {
      login: 'Nobody',
      password: 'wrongpassword',
    });

    assert.equal(wrong.status, 401);
    assert.equal(unknown.status, 401);
    assert.deepEqual(await json(wrong), await json(unknown));
  });
});

test('a blocked account is refused with 403', async () => {
  const { deps } = authDeps({ status: 'blocked' });
  await withApp(deps, async (base) => {
    await post(base, 'register', registration);
    const response = await post(base, 'login', {
      login: 'Bob',
      password: 'hunter2hunter2',
    });

    assert.equal(response.status, 403);
  });
});

test('GET /me returns the signed-in user', async () => {
  const { deps } = authDeps();
  await withApp(deps, async (base) => {
    const token = sessionCookie(await post(base, 'register', registration));
    const response = await fetch(`${base}/api/auth/me`, {
      headers: { cookie: `${SESSION_COOKIE_NAME}=${token}` },
    });

    assert.equal(response.status, 200);
    assert.equal((await json<PublicUser>(response)).login, 'Bob');
  });
});

test('GET /me without a cookie is 401', async () => {
  const { deps } = authDeps();
  await withApp(deps, async (base) => {
    assert.equal((await fetch(`${base}/api/auth/me`)).status, 401);
  });
});

test('POST /logout revokes the session it was called with', async () => {
  const { deps } = authDeps();
  await withApp(deps, async (base) => {
    const token = sessionCookie(await post(base, 'register', registration));
    const cookie = `${SESSION_COOKIE_NAME}=${token}`;

    assert.equal((await post(base, 'logout', {}, cookie)).status, 204);
    assert.equal(
      (await fetch(`${base}/api/auth/me`, { headers: { cookie } })).status,
      401
    );
  });
});

test('POST /logout without a session is still 204: logging out twice is not an error', async () => {
  const { deps } = authDeps();
  await withApp(deps, async (base) => {
    assert.equal((await post(base, 'logout', {})).status, 204);
  });
});
