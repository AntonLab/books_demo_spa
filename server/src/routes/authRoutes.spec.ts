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
import type { PasswordResetRepository } from '../repositories/passwordResetRepository.ts';
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

  async function setPassword(id: number, plaintext: string): Promise<void> {
    const row = rows.get(id);
    if (!row) return;
    // 'test' pins the deliberately weak argon2 parameters from password.ts, so
    // the suite does not spend seconds inside the KDF.
    row.password = await hashPassword(plaintext, 'test');
  }

  return { repository, setPassword };
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

// Takes the two collaborators explicitly rather than deriving them, so the
// fake's reach matches the real repository's: password, token, sessions.
function createFakeResets(
  users: ReturnType<typeof createFakeUsers>,
  sessions: ReturnType<typeof createFakeSessions>
) {
  const rows = new Map<
    string,
    { userId: number; usedAt: Date | null; expiresAt: Date }
  >();

  const repository: PasswordResetRepository = {
    async create(userId, tokenHash, expiresAt) {
      rows.set(tokenHash, { userId, usedAt: null, expiresAt });
    },
    async invalidateAllForUser(userId) {
      let affected = 0;
      for (const row of rows.values()) {
        if (row.userId === userId && row.usedAt === null) {
          row.usedAt = new Date();
          affected += 1;
        }
      }
      return affected;
    },
    // Mirrors the real repository's single-use + expiry filter; the real one
    // does it in SQL inside a transaction, this one in memory.
    async redeem(tokenHash, newPassword) {
      const row = rows.get(tokenHash);
      if (!row || row.usedAt !== null || row.expiresAt <= new Date())
        return false;
      row.usedAt = new Date();
      await users.setPassword(row.userId, newPassword);
      await sessions.repository.deleteAllForUser(row.userId);
      return true;
    },
  };

  return { repository, rows };
}

function authDeps(seed: { status?: UserStatus } = {}) {
  const sessions = createFakeSessions();
  const users = createFakeUsers(seed);
  const resets = createFakeResets(users, sessions);
  const delivered: { email: string; token: string }[] = [];

  return {
    deps: {
      userRepository: users.repository,
      sessionRepository: sessions.repository,
      passwordResetRepository: resets.repository,
      resetDelivery: {
        async send(email: string, token: string) {
          delivered.push({ email, token });
        },
      },
    },
    sessions,
    resets,
    delivered,
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

test('a reset request for a known address is accepted and delivers a link', async () => {
  const { deps, delivered } = authDeps();
  await withApp(deps, async (base) => {
    await post(base, 'register', registration);
    const response = await post(base, 'password-reset/request', {
      email: 'bob@example.com',
    });

    assert.equal(response.status, 202);
    assert.equal(delivered.length, 1);
  });
});

test('a reset request for an unknown address is accepted identically', async () => {
  const { deps, delivered } = authDeps();
  await withApp(deps, async (base) => {
    await post(base, 'register', registration);

    const known = await post(base, 'password-reset/request', {
      email: 'bob@example.com',
    });
    const unknown = await post(base, 'password-reset/request', {
      email: 'nobody@example.com',
    });

    assert.equal(known.status, unknown.status);
    assert.equal(await known.text(), await unknown.text());
    // The difference is invisible to the caller but real on the server.
    assert.equal(delivered.length, 1);
  });
});

test('the delivered token is not the value stored', async () => {
  const { deps, delivered, resets } = authDeps();
  await withApp(deps, async (base) => {
    await post(base, 'register', registration);
    await post(base, 'password-reset/request', { email: 'bob@example.com' });

    const token = delivered[0]?.token;
    assert.ok(token);
    assert.equal(resets.rows.has(token), false);
    assert.ok(resets.rows.has(hashToken(token)));
  });
});

test('confirming a reset lets the new password log in', async () => {
  const { deps, delivered } = authDeps();
  await withApp(deps, async (base) => {
    await post(base, 'register', registration);
    await post(base, 'password-reset/request', { email: 'bob@example.com' });

    const confirm = await post(base, 'password-reset/confirm', {
      token: delivered[0]?.token,
      password: 'brandnewpassword',
    });

    assert.equal(confirm.status, 204);
    assert.equal(
      (
        await post(base, 'login', {
          login: 'Bob',
          password: 'brandnewpassword',
        })
      ).status,
      200
    );
  });
});

test('confirming a reset kills sessions opened before it', async () => {
  const { deps, delivered } = authDeps();
  await withApp(deps, async (base) => {
    const token = sessionCookie(await post(base, 'register', registration));
    const cookie = `${SESSION_COOKIE_NAME}=${token}`;
    await post(base, 'password-reset/request', { email: 'bob@example.com' });

    await post(base, 'password-reset/confirm', {
      token: delivered[0]?.token,
      password: 'brandnewpassword',
    });

    assert.equal(
      (await fetch(`${base}/api/auth/me`, { headers: { cookie } })).status,
      401
    );
  });
});

test('a reset token cannot be used twice', async () => {
  const { deps, delivered } = authDeps();
  await withApp(deps, async (base) => {
    await post(base, 'register', registration);
    await post(base, 'password-reset/request', { email: 'bob@example.com' });
    const token = delivered[0]?.token;

    await post(base, 'password-reset/confirm', {
      token,
      password: 'brandnewpassword',
    });
    const second = await post(base, 'password-reset/confirm', {
      token,
      password: 'yetanotherpassword',
    });

    assert.equal(second.status, 400);
  });
});

test('an unknown token and a used token fail identically', async () => {
  const { deps, delivered } = authDeps();
  await withApp(deps, async (base) => {
    await post(base, 'register', registration);
    await post(base, 'password-reset/request', { email: 'bob@example.com' });
    const token = delivered[0]?.token;
    await post(base, 'password-reset/confirm', {
      token,
      password: 'brandnewpassword',
    });

    const used = await post(base, 'password-reset/confirm', {
      token,
      password: 'anotherpassword1',
    });
    const unknown = await post(base, 'password-reset/confirm', {
      token: 'never-issued',
      password: 'anotherpassword1',
    });

    assert.deepEqual(await json(used), await json(unknown));
  });
});

test('a second reset request supersedes the first token', async () => {
  const { deps, delivered } = authDeps();
  await withApp(deps, async (base) => {
    await post(base, 'register', registration);
    await post(base, 'password-reset/request', { email: 'bob@example.com' });
    await post(base, 'password-reset/request', { email: 'bob@example.com' });

    const response = await post(base, 'password-reset/confirm', {
      token: delivered[0]?.token,
      password: 'brandnewpassword',
    });

    assert.equal(response.status, 400);
  });
});

test('a reset password under 8 characters is rejected', async () => {
  const { deps, delivered } = authDeps();
  await withApp(deps, async (base) => {
    await post(base, 'register', registration);
    await post(base, 'password-reset/request', { email: 'bob@example.com' });

    const response = await post(base, 'password-reset/confirm', {
      token: delivered[0]?.token,
      password: 'short',
    });

    assert.equal(response.status, 400);
  });
});
