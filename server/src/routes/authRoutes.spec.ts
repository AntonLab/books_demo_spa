import test from 'node:test';
import assert from 'node:assert/strict';
import { withApp, json } from './routeTestKit.testkit.ts';
import { createAuthRateLimits } from '../middleware/authRateLimit.ts';
import { hashToken } from '../tokens.ts';
import { xsrfTokenFor } from '../middleware/csrfProtection.ts';
import { SESSION_COOKIE_NAME } from '../sessionCookie.ts';
import type {
  SessionRepository,
  SessionRecord,
} from '../repositories/sessionRepository.ts';
import type { PasswordResetRepository } from '../repositories/passwordResetRepository.ts';
import type { UserRepository } from '../repositories/userRepository.ts';
import { createFakeUserRepository } from '../repositories/userRepository.fake.testkit.ts';
import type { PublicUser } from 'shared';

const registration = {
  login: 'Bob',
  email: 'bob@example.com',
  password: 'hunter2hunter2',
  firstName: 'Bob',
  lastName: 'Bobsson',
};

function createFakeSessions(users: UserRepository) {
  const rows = new Map<string, SessionRecord>();
  let nextId = 1;

  function insert(
    userId: number,
    tokenHash: string,
    expiresAt: Date
  ): SessionRecord {
    const record = { id: nextId, userId, expiresAt };
    nextId += 1;
    rows.set(tokenHash, record);
    return record;
  }

  const repository: SessionRepository = {
    async create(userId, tokenHash, expiresAt) {
      return insert(userId, tokenHash, expiresAt);
    },
    // The real re-check re-reads the account under a row lock inside a
    // transaction; here it is two plain reads of the user fake, which is
    // enough for a single-threaded fake.
    async createIfCredentialCurrent(
      userId,
      tokenHash,
      expiresAt,
      verifiedPasswordHash
    ) {
      const password = await users.findPasswordHashById(userId);
      const user = await users.findById(userId);
      if (!user || password !== verifiedPasswordHash) {
        return 'credential-changed';
      }
      if (user.status === 'blocked') return 'blocked';
      insert(userId, tokenHash, expiresAt);
      return 'created';
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
    // The expiry purge runs on a timer, never through a route.
    async deleteExpired() {
      throw new Error('the expiry purge is not reachable from a route');
    },
  };

  return { repository, rows };
}

// Takes the two collaborators explicitly rather than deriving them, so the
// fake's reach matches the real repository's: password, token, sessions.
function createFakeResets(
  users: UserRepository,
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
      await users.update(row.userId, { password: newPassword });
      await sessions.repository.deleteAllForUser(row.userId);
      return true;
    },
    // The expiry purge runs on a timer, never through a route.
    async deleteExpiredBefore() {
      throw new Error('the expiry purge is not reachable from a route');
    },
  };

  return { repository, rows };
}

function authDeps() {
  const users = createFakeUserRepository();
  const sessions = createFakeSessions(users);
  const resets = createFakeResets(users, sessions);
  const delivered: { email: string; token: string }[] = [];

  return {
    deps: {
      userRepository: users,
      sessionRepository: sessions.repository,
      passwordResetRepository: resets.repository,
      resetDelivery: {
        async send(email: string, token: string) {
          delivered.push({ email, token });
        },
      },
    },
    users,
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

const postFrom = (
  base: string,
  path: string,
  body: unknown,
  forwardedFor: string
) =>
  fetch(`${base}/api/auth/${path}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-forwarded-for': forwardedFor,
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

test('POST /register creates an author when the box is ticked', async () => {
  const { deps } = authDeps();
  await withApp(deps, async (base) => {
    const response = await post(base, 'register', {
      ...registration,
      role: 'author',
    });

    assert.equal(response.status, 201);
    assert.equal((await json<PublicUser>(response)).role, 'author');
  });
});

test('POST /register refuses to make an admin', async () => {
  const { deps } = authDeps();
  await withApp(deps, async (base) => {
    const response = await post(base, 'register', {
      ...registration,
      role: 'admin',
    });

    assert.equal(response.status, 400);
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
  const { deps, users } = authDeps();
  await withApp(deps, async (base) => {
    const { id } = await json<PublicUser>(
      await post(base, 'register', registration)
    );
    await users.update(id, { status: 'blocked' });
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

test('opening a session also hands the client its XSRF token, which a script can read', async () => {
  const { deps } = authDeps();
  await withApp(deps, async (base) => {
    const response = await post(base, 'register', registration);
    const cookies = response.headers.getSetCookie();
    const session = sessionCookie(response);
    const xsrf = cookies.find((cookie) => cookie.startsWith('xsrfToken='));

    assert.ok(session);
    assert.ok(xsrf);
    assert.match(xsrf, new RegExp(`^xsrfToken=${xsrfTokenFor(session)};`));
    assert.doesNotMatch(xsrf, /HttpOnly/i);
    assert.match(xsrf, /SameSite=Lax/i);
  });
});

// The sign-in limits wired into the routes. Every other test here runs on the
// test kit's unlimited set; these pass the real one.

test('POST /login refuses the 11th failed attempt on one login with 429, before any password check', async () => {
  const { deps, users } = authDeps();
  let lookups = 0;
  const counted: UserRepository = {
    ...users,
    async findByLoginWithPassword(login) {
      lookups += 1;
      return users.findByLoginWithPassword(login);
    },
  };
  const limits = createAuthRateLimits();
  try {
    await withApp(
      { ...deps, userRepository: counted, authRateLimits: limits },
      async (base) => {
        await post(base, 'register', registration);
        for (let attempt = 0; attempt < 10; attempt += 1) {
          const wrong = await post(base, 'login', {
            login: 'Bob',
            password: 'wrongpassword',
          });
          assert.equal(wrong.status, 401);
        }

        // The right password, too late: refused before the lookup and argon2.
        const refused = await post(base, 'login', {
          login: 'Bob',
          password: 'hunter2hunter2',
        });
        assert.equal(refused.status, 429);
        assert.match(refused.headers.get('retry-after') ?? '', /^\d+$/);
        assert.equal(lookups, 10);
      }
    );
  } finally {
    limits.stop();
  }
});

test('POST /register refuses the 6th request from one address within the hour, malformed or not', async () => {
  const { deps } = authDeps();
  const limits = createAuthRateLimits();
  try {
    await withApp({ ...deps, authRateLimits: limits }, async (base) => {
      for (let attempt = 0; attempt < 5; attempt += 1) {
        assert.equal((await post(base, 'register', {})).status, 400);
      }

      assert.equal((await post(base, 'register', registration)).status, 429);
    });
  } finally {
    limits.stop();
  }
});

test('POST /password-reset/request refuses the 6th request from one address within the hour', async () => {
  const { deps } = authDeps();
  const limits = createAuthRateLimits();
  try {
    await withApp({ ...deps, authRateLimits: limits }, async (base) => {
      const request = { email: 'nobody@example.com' };
      for (let attempt = 0; attempt < 5; attempt += 1) {
        assert.equal(
          (await post(base, 'password-reset/request', request)).status,
          202
        );
      }

      assert.equal(
        (await post(base, 'password-reset/request', request)).status,
        429
      );
    });
  } finally {
    limits.stop();
  }
});

test('behind one trusted proxy, each client X-Forwarded-For names keeps its own budget', async () => {
  const { deps } = authDeps();
  const limits = createAuthRateLimits();
  try {
    await withApp(
      { ...deps, authRateLimits: limits, trustProxy: 1 },
      async (base) => {
        for (let attempt = 0; attempt < 5; attempt += 1) {
          assert.equal(
            (await postFrom(base, 'register', {}, '203.0.113.1')).status,
            400
          );
        }

        assert.equal(
          (await postFrom(base, 'register', {}, '203.0.113.1')).status,
          429
        );
        assert.equal(
          (await postFrom(base, 'register', {}, '203.0.113.2')).status,
          400
        );
      }
    );
  } finally {
    limits.stop();
  }
});

test('with no trusted proxy, X-Forwarded-For is ignored and every client shares the address budget', async () => {
  const { deps } = authDeps();
  const limits = createAuthRateLimits();
  try {
    await withApp({ ...deps, authRateLimits: limits }, async (base) => {
      for (let attempt = 0; attempt < 5; attempt += 1) {
        assert.equal(
          (await postFrom(base, 'register', {}, '203.0.113.1')).status,
          400
        );
      }

      assert.equal(
        (await postFrom(base, 'register', {}, '203.0.113.2')).status,
        429
      );
    });
  } finally {
    limits.stop();
  }
});
