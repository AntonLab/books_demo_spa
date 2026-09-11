import test from 'node:test';
import assert from 'node:assert/strict';
import { ConflictError } from '../types/errors.ts';
import type {
  UserRepository,
  UserListResult,
} from '../repositories/userRepository.ts';
import type { PublicUser } from '../types/user.ts';
import {
  AUTH_COOKIE,
  json,
  ROLE_COOKIES,
  USER_IDS,
  withApp,
  withAuthenticatedApp,
} from './routeTestKit.testkit.ts';

// Rows for the personas the role tests act on. Seeded directly rather than
// posted, because POST now requires a superadmin session (the matrix grants
// `users × create` to superadmin alone) and would otherwise assign its own
// ids instead of the fixed ones ROLE_COOKIES/USER_IDS depend on.
function seedPersonaRows(): PublicUser[] {
  const now = new Date();
  const row = (id: number, role: PublicUser['role']): PublicUser => ({
    id,
    login: `persona-${id}`,
    email: `persona-${id}@example.com`,
    firstName: 'Persona',
    lastName: 'User',
    status: 'active',
    role,
    createdAt: now,
    updatedAt: now,
  });

  return [
    row(USER_IDS.user, 'user'),
    row(USER_IDS.author, 'author'),
    row(USER_IDS.admin, 'admin'),
    row(USER_IDS.superadmin, 'superadmin'),
  ];
}

function createFakeRepository(seed: PublicUser[] = []): UserRepository {
  const rows = new Map<number, PublicUser>(seed.map((row) => [row.id, row]));
  let nextId = 1;

  const conflicts = (login: string, email: string, skipId?: number): void => {
    for (const row of rows.values()) {
      if (row.id === skipId) continue;
      if (row.login === login) throw new ConflictError('login');
      if (row.email.toLowerCase() === email.toLowerCase())
        throw new ConflictError('email');
    }
  };

  return {
    async create(input) {
      conflicts(input.login, input.email);
      const now = new Date();
      const user: PublicUser = {
        id: nextId,
        login: input.login,
        email: input.email,
        firstName: input.firstName,
        lastName: input.lastName,
        status: input.status ?? 'pending',
        role: 'user',
        createdAt: now,
        updatedAt: now,
      };
      nextId += 1;
      rows.set(user.id, user);
      return user;
    },

    async list(query): Promise<UserListResult> {
      const all = [...rows.values()].filter(
        (row) => !query.status || row.status === query.status
      );
      return {
        items: all.slice(query.offset, query.offset + query.limit),
        total: all.length,
      };
    },

    async findById(id) {
      return rows.get(id) ?? null;
    },

    async update(id, input) {
      const current = rows.get(id);
      if (!current) return null;
      conflicts(input.login ?? current.login, input.email ?? current.email, id);
      const updated: PublicUser = {
        ...current,
        login: input.login ?? current.login,
        email: input.email ?? current.email,
        firstName: input.firstName ?? current.firstName,
        lastName: input.lastName ?? current.lastName,
        status: input.status ?? current.status,
        updatedAt: new Date(),
      };
      rows.set(id, updated);
      return updated;
    },

    async remove(id) {
      return rows.delete(id);
    },

    async updateRole(id, role) {
      const current = rows.get(id);
      if (!current) return null;
      const updated: PublicUser = { ...current, role, updatedAt: new Date() };
      rows.set(id, updated);
      return updated;
    },

    // No request in this file reaches auth lookups; the fake only needs to
    // satisfy the interface.
    async findByLoginWithPassword() {
      return null;
    },

    async findByEmail() {
      return null;
    },
  };
}

const valid = {
  login: 'Bob',
  email: 'bob@example.com',
  password: 'hunter2hunter2',
  firstName: 'Bob',
  lastName: 'Bobsson',
};

// The matrix grants `users × create` to superadmin alone — this is the
// administrative create, not registration — so the structural tests below
// (validation, conflicts, paging) act as that persona by default.
const post = (
  base: string,
  body: unknown,
  cookie: string | null = ROLE_COOKIES.superadmin
) =>
  fetch(`${base}/api/users`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(cookie ? { cookie } : {}),
    },
    body: JSON.stringify(body),
  });

const patch = (
  base: string,
  id: number,
  body: unknown,
  cookie: string | null = AUTH_COOKIE
) =>
  fetch(`${base}/api/users/${id}`, {
    method: 'PATCH',
    headers: {
      'content-type': 'application/json',
      ...(cookie ? { cookie } : {}),
    },
    body: JSON.stringify(body),
  });

const patchRole = (
  base: string,
  id: number,
  body: unknown,
  cookie: string | null = AUTH_COOKIE
) =>
  fetch(`${base}/api/users/${id}/role`, {
    method: 'PATCH',
    headers: {
      'content-type': 'application/json',
      ...(cookie ? { cookie } : {}),
    },
    body: JSON.stringify(body),
  });

test('POST creates a user and never echoes the password', async () => {
  await withAuthenticatedApp(
    { userRepository: createFakeRepository() },
    async (base) => {
      const response = await post(base, valid);
      const body = await json<{ login: string; status: string }>(response);

      assert.equal(response.status, 201);
      assert.equal(body.login, 'Bob');
      assert.equal(body.status, 'pending');
      assert.equal('password' in body, false);
    }
  );
});

test('POST rejects an invalid email with 400', async () => {
  await withAuthenticatedApp(
    { userRepository: createFakeRepository() },
    async (base) => {
      const response = await post(base, { ...valid, email: 'nope' });

      assert.equal(response.status, 400);
      assert.match(
        (await json<{ error: string }>(response)).error,
        /validation/i
      );
    }
  );
});

test('POST rejects a duplicate login with 409 naming the field', async () => {
  await withAuthenticatedApp(
    { userRepository: createFakeRepository() },
    async (base) => {
      await post(base, valid);
      const response = await post(base, {
        ...valid,
        email: 'other@example.com',
      });

      assert.equal(response.status, 409);
      assert.deepEqual((await json<{ details: unknown }>(response)).details, {
        field: 'login',
      });
    }
  );
});

test('GET list returns items with the paging envelope', async () => {
  await withAuthenticatedApp(
    { userRepository: createFakeRepository() },
    async (base) => {
      await post(base, valid);
      const response = await fetch(`${base}/api/users`, {
        headers: { cookie: AUTH_COOKIE },
      });
      const body = await json<{
        total: number;
        limit: number;
        offset: number;
        items: unknown[];
      }>(response);

      assert.equal(response.status, 200);
      assert.equal(body.total, 1);
      assert.equal(body.limit, 20);
      assert.equal(body.offset, 0);
      assert.equal(body.items.length, 1);
    }
  );
});

test('GET by id returns 404 for a missing record', async () => {
  await withAuthenticatedApp(
    { userRepository: createFakeRepository() },
    async (base) => {
      const response = await fetch(`${base}/api/users/999`, {
        headers: { cookie: AUTH_COOKIE },
      });

      assert.equal(response.status, 404);
    }
  );
});

test('GET by id rejects a non-numeric id with 400', async () => {
  await withAuthenticatedApp(
    { userRepository: createFakeRepository() },
    async (base) => {
      const response = await fetch(`${base}/api/users/abc`, {
        headers: { cookie: AUTH_COOKIE },
      });

      assert.equal(response.status, 400);
    }
  );
});

test('PATCH updates one field', async () => {
  await withAuthenticatedApp(
    { userRepository: createFakeRepository() },
    async (base) => {
      const created = await json<{ id: number }>(await post(base, valid));
      const response = await fetch(`${base}/api/users/${created.id}`, {
        method: 'PATCH',
        headers: {
          'content-type': 'application/json',
          cookie: AUTH_COOKIE,
        },
        body: JSON.stringify({ firstName: 'Robert' }),
      });
      const body = await json<{ firstName: string; lastName: string }>(
        response
      );

      assert.equal(response.status, 200);
      assert.equal(body.firstName, 'Robert');
      assert.equal(body.lastName, 'Bobsson');
    }
  );
});

test('PATCH rejects an empty body with 400', async () => {
  await withAuthenticatedApp(
    { userRepository: createFakeRepository() },
    async (base) => {
      const created = await json<{ id: number }>(await post(base, valid));
      const response = await fetch(`${base}/api/users/${created.id}`, {
        method: 'PATCH',
        headers: {
          'content-type': 'application/json',
          cookie: AUTH_COOKIE,
        },
        body: JSON.stringify({}),
      });

      assert.equal(response.status, 400);
    }
  );
});

test('DELETE returns 204 once and 404 afterwards', async () => {
  await withAuthenticatedApp(
    { userRepository: createFakeRepository() },
    async (base) => {
      const created = await json<{ id: number }>(await post(base, valid));

      assert.equal(
        (
          await fetch(`${base}/api/users/${created.id}`, {
            method: 'DELETE',
            headers: { cookie: AUTH_COOKIE },
          })
        ).status,
        204
      );
      assert.equal(
        (
          await fetch(`${base}/api/users/${created.id}`, {
            method: 'DELETE',
            headers: { cookie: AUTH_COOKIE },
          })
        ).status,
        404
      );
    }
  );
});

test('an unknown route returns a JSON 404', async () => {
  await withAuthenticatedApp(
    { userRepository: createFakeRepository() },
    async (base) => {
      const response = await fetch(`${base}/api/nothing-here`);

      assert.equal(response.status, 404);
      assert.ok((await json<{ error: string }>(response)).error);
    }
  );
});

test('POST without a session is 401', async () => {
  await withApp({ userRepository: createFakeRepository() }, async (base) => {
    assert.equal((await post(base, valid, null)).status, 401);
  });
});

test('PATCH without a session is 401', async () => {
  await withApp({ userRepository: createFakeRepository() }, async (base) => {
    const response = await fetch(`${base}/api/users/1`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ firstName: 'Robert' }),
    });

    assert.equal(response.status, 401);
  });
});

test('DELETE without a session is 401', async () => {
  await withApp({ userRepository: createFakeRepository() }, async (base) => {
    const response = await fetch(`${base}/api/users/1`, { method: 'DELETE' });

    assert.equal(response.status, 401);
  });
});

test('GET /api/users requires a session, since PublicUser carries email addresses', async () => {
  await withApp({ userRepository: createFakeRepository() }, async (base) => {
    assert.equal((await fetch(`${base}/api/users`)).status, 401);
  });
});

test('GET /api/users/:id requires a session for the same reason', async () => {
  await withApp({ userRepository: createFakeRepository() }, async (base) => {
    assert.equal((await fetch(`${base}/api/users/1`)).status, 401);
  });
});

test('a user may edit their own row and not another', async () => {
  await withAuthenticatedApp(
    { userRepository: createFakeRepository(seedPersonaRows()) },
    async (base) => {
      assert.equal(
        (
          await patch(
            base,
            USER_IDS.user,
            { firstName: 'New' },
            ROLE_COOKIES.user
          )
        ).status,
        200
      );
      assert.equal(
        (
          await patch(
            base,
            USER_IDS.author,
            { firstName: 'Hijack' },
            ROLE_COOKIES.user
          )
        ).status,
        403
      );
    }
  );
});

test('a role in a PATCH body is ignored', async () => {
  // The field is absent from the schema rather than filtered in the handler,
  // so this cannot regress by someone forgetting a check.
  await withAuthenticatedApp(
    { userRepository: createFakeRepository(seedPersonaRows()) },
    async (base) => {
      const response = await patch(
        base,
        USER_IDS.user,
        { firstName: 'New', role: 'superadmin' },
        ROLE_COOKIES.user
      );

      assert.equal(response.status, 200);
      assert.equal((await json<PublicUser>(response)).role, 'user');
    }
  );
});

test('the owner may switch between user and author', async () => {
  await withAuthenticatedApp(
    { userRepository: createFakeRepository(seedPersonaRows()) },
    async (base) => {
      const response = await patchRole(
        base,
        USER_IDS.user,
        { role: 'author' },
        ROLE_COOKIES.user
      );

      assert.equal(response.status, 200);
      assert.equal((await json<PublicUser>(response)).role, 'author');
    }
  );
});

test('the owner may not promote themselves to admin', async () => {
  await withAuthenticatedApp(
    { userRepository: createFakeRepository(seedPersonaRows()) },
    async (base) => {
      const response = await patchRole(
        base,
        USER_IDS.user,
        { role: 'admin' },
        ROLE_COOKIES.user
      );

      assert.equal(response.status, 403);
    }
  );
});

test('a superadmin may set any role on anyone', async () => {
  await withAuthenticatedApp(
    { userRepository: createFakeRepository(seedPersonaRows()) },
    async (base) => {
      const response = await patchRole(
        base,
        USER_IDS.user,
        { role: 'admin' },
        ROLE_COOKIES.superadmin
      );

      assert.equal(response.status, 200);
      assert.equal((await json<PublicUser>(response)).role, 'admin');
    }
  );
});

test('an admin may not set roles — that is superadmin only', async () => {
  await withAuthenticatedApp(
    { userRepository: createFakeRepository(seedPersonaRows()) },
    async (base) => {
      const response = await patchRole(
        base,
        USER_IDS.author,
        { role: 'admin' },
        ROLE_COOKIES.admin
      );

      assert.equal(response.status, 403);
    }
  );
});
