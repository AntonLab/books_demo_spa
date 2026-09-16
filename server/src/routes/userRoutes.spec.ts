import test from 'node:test';
import assert from 'node:assert/strict';
import type { UserRepository } from '../repositories/userRepository.ts';
import {
  createFakeUserRepository,
  type FakeUserRow,
} from '../repositories/userRepository.fake.testkit.ts';
import { hashPassword } from '../password.ts';
import { SESSION_COOKIE_NAME } from '../sessionCookie.ts';
import type { PublicUser } from '../types/user.ts';
import {
  AUTH_COOKIE,
  json,
  ROLE_COOKIES,
  USER_IDS,
  withApp,
  withAuthenticatedApp,
} from './routeTestKit.testkit.ts';

// Targets only: no cookie resolves to these ids. They are what lets a spec
// prove one admin cannot touch another, and that a superadmin can.
const OTHER_ADMIN_ID = 6;
const OTHER_SUPERADMIN_ID = 7;

// Every seeded and created row shares one known password, hashed once with
// the deliberately weak test parameters.
const PASSWORD = 'hunter2hunter2';
const PASSWORD_HASH = await hashPassword(PASSWORD, 'test');

// Rows for the personas the role tests act on. Seeded directly rather than
// posted, because POST now requires a superadmin session (the matrix grants
// `users × create` to superadmin alone) and would otherwise assign its own
// ids instead of the fixed ones ROLE_COOKIES/USER_IDS depend on.
function seedPersonaRows(): FakeUserRow[] {
  const now = new Date();
  const row = (id: number, role: PublicUser['role']): FakeUserRow => ({
    id,
    login: `persona-${id}`,
    email: `persona-${id}@example.com`,
    firstName: 'Persona',
    lastName: 'User',
    status: 'active',
    role,
    avatarUrl: null,
    password: PASSWORD_HASH,
    createdAt: now,
    updatedAt: now,
  });

  return [
    row(USER_IDS.user, 'user'),
    row(USER_IDS.author, 'author'),
    row(USER_IDS.admin, 'admin'),
    row(USER_IDS.superadmin, 'superadmin'),
    row(OTHER_ADMIN_ID, 'admin'),
    row(OTHER_SUPERADMIN_ID, 'superadmin'),
  ];
}

const createFakeRepository = (seed: FakeUserRow[] = []): UserRepository =>
  createFakeUserRepository({ seed });

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

const remove = (
  base: string,
  id: number,
  cookie: string | null = AUTH_COOKIE
) =>
  fetch(`${base}/api/users/${id}`, {
    method: 'DELETE',
    ...(cookie ? { headers: { cookie } } : {}),
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

// The matrix grants `users × create` to superadmin alone. These two pin that:
// guarding the route with a plain session check again would let both through.
test('a plain user may not create an account through POST /api/users', async () => {
  await withAuthenticatedApp(
    { userRepository: createFakeRepository() },
    async (base) => {
      assert.equal((await post(base, valid, ROLE_COOKIES.user)).status, 403);
    }
  );
});

test('an admin may not create an account either — that is superadmin only', async () => {
  await withAuthenticatedApp(
    { userRepository: createFakeRepository() },
    async (base) => {
      assert.equal((await post(base, valid, ROLE_COOKIES.admin)).status, 403);
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

test('a plain user may not DELETE another user account', async () => {
  await withAuthenticatedApp(
    { userRepository: createFakeRepository(seedPersonaRows()) },
    async (base) => {
      const response = await remove(base, USER_IDS.author, ROLE_COOKIES.user);
      assert.equal(response.status, 403);

      // The row must survive the refused attempt, not just the status code.
      const stillThere = await fetch(`${base}/api/users/${USER_IDS.author}`, {
        headers: { cookie: ROLE_COOKIES.superadmin },
      });
      assert.equal(stillThere.status, 200);
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

// Targets a different row with a role that would be self-service on the
// caller's own row. Only the own-row half of the guard refuses this — if it
// were dropped, this request would be indistinguishable from the owner
// tests above (both are the self-service `user`/`author` list), and any
// signed-in user could set someone else's role.
test('a plain user may not set another user role, even to a self-service one', async () => {
  await withAuthenticatedApp(
    { userRepository: createFakeRepository(seedPersonaRows()) },
    async (base) => {
      const response = await patchRole(
        base,
        USER_IDS.author,
        { role: 'user' },
        ROLE_COOKIES.user
      );

      assert.equal(response.status, 403);
    }
  );
});

// Same shape one role up: an admin is not superadmin, so the own-row guard
// still applies and refuses touching someone else's role — including
// demoting the superadmin to `user`.
test('an admin may not set another user role either, not even the superadmin', async () => {
  await withAuthenticatedApp(
    { userRepository: createFakeRepository(seedPersonaRows()) },
    async (base) => {
      const response = await patchRole(
        base,
        USER_IDS.superadmin,
        { role: 'user' },
        ROLE_COOKIES.admin
      );

      assert.equal(response.status, 403);
    }
  );
});

test('an admin may edit user and author accounts', async () => {
  await withAuthenticatedApp(
    { userRepository: createFakeRepository(seedPersonaRows()) },
    async (base) => {
      for (const id of [USER_IDS.user, USER_IDS.author]) {
        const response = await patch(
          base,
          id,
          { firstName: 'Edited' },
          ROLE_COOKIES.admin
        );
        assert.equal(response.status, 200, `target ${id}`);
      }
    }
  );
});

test('an admin may not edit another admin or a superadmin', async () => {
  await withAuthenticatedApp(
    { userRepository: createFakeRepository(seedPersonaRows()) },
    async (base) => {
      for (const id of [OTHER_ADMIN_ID, USER_IDS.superadmin]) {
        const response = await patch(
          base,
          id,
          { password: 'takeover-attempt' },
          ROLE_COOKIES.admin
        );
        assert.equal(response.status, 403, `target ${id}`);
      }
    }
  );
});

test('an admin may not delete another admin or a superadmin', async () => {
  await withAuthenticatedApp(
    { userRepository: createFakeRepository(seedPersonaRows()) },
    async (base) => {
      for (const id of [OTHER_ADMIN_ID, USER_IDS.superadmin]) {
        assert.equal(
          (await remove(base, id, ROLE_COOKIES.admin)).status,
          403,
          `target ${id}`
        );
        const stillThere = await fetch(`${base}/api/users/${id}`, {
          headers: { cookie: ROLE_COOKIES.superadmin },
        });
        assert.equal(stillThere.status, 200, `target ${id}`);
      }
    }
  );
});

test('an admin may delete a user account', async () => {
  await withAuthenticatedApp(
    { userRepository: createFakeRepository(seedPersonaRows()) },
    async (base) => {
      const response = await remove(base, USER_IDS.user, ROLE_COOKIES.admin);
      assert.equal(response.status, 204);
    }
  );
});

test('an admin may edit and delete their own account', async () => {
  await withAuthenticatedApp(
    { userRepository: createFakeRepository(seedPersonaRows()) },
    async (base) => {
      const edited = await patch(
        base,
        USER_IDS.admin,
        { firstName: 'Self' },
        ROLE_COOKIES.admin
      );
      assert.equal(edited.status, 200);
      assert.equal(
        (await remove(base, USER_IDS.admin, ROLE_COOKIES.admin)).status,
        204
      );
    }
  );
});

test('an admin acting on a missing account gets 404, not 403', async () => {
  await withAuthenticatedApp(
    { userRepository: createFakeRepository(seedPersonaRows()) },
    async (base) => {
      const edited = await patch(
        base,
        999,
        { firstName: 'Nobody' },
        ROLE_COOKIES.admin
      );
      assert.equal(edited.status, 404);
      assert.equal((await remove(base, 999, ROLE_COOKIES.admin)).status, 404);
    }
  );
});

test('a superadmin may edit and delete another superadmin', async () => {
  await withAuthenticatedApp(
    { userRepository: createFakeRepository(seedPersonaRows()) },
    async (base) => {
      const edited = await patch(
        base,
        OTHER_SUPERADMIN_ID,
        { firstName: 'Peer' },
        ROLE_COOKIES.superadmin
      );
      assert.equal(edited.status, 200);
      assert.equal(
        (await remove(base, OTHER_SUPERADMIN_ID, ROLE_COOKIES.superadmin))
          .status,
        204
      );
    }
  );
});

test('a superadmin may not delete their own account', async () => {
  await withAuthenticatedApp(
    { userRepository: createFakeRepository(seedPersonaRows()) },
    async (base) => {
      const response = await remove(
        base,
        USER_IDS.superadmin,
        ROLE_COOKIES.superadmin
      );
      assert.equal(response.status, 403);

      const stillThere = await fetch(
        `${base}/api/users/${USER_IDS.superadmin}`,
        { headers: { cookie: ROLE_COOKIES.superadmin } }
      );
      assert.equal(stillThere.status, 200);
    }
  );
});

test('a superadmin may not change their own role', async () => {
  await withAuthenticatedApp(
    { userRepository: createFakeRepository(seedPersonaRows()) },
    async (base) => {
      const response = await patchRole(
        base,
        USER_IDS.superadmin,
        { role: 'user' },
        ROLE_COOKIES.superadmin
      );
      assert.equal(response.status, 403);
    }
  );
});

test('a superadmin may still change another superadmin role', async () => {
  await withAuthenticatedApp(
    { userRepository: createFakeRepository(seedPersonaRows()) },
    async (base) => {
      const response = await patchRole(
        base,
        OTHER_SUPERADMIN_ID,
        { role: 'admin' },
        ROLE_COOKIES.superadmin
      );
      assert.equal(response.status, 200);
      assert.equal((await json<PublicUser>(response)).role, 'admin');
    }
  );
});

test('nobody may change their own status, whatever their role', async () => {
  await withAuthenticatedApp(
    { userRepository: createFakeRepository(seedPersonaRows()) },
    async (base) => {
      for (const persona of ['user', 'admin', 'superadmin'] as const) {
        const response = await patch(
          base,
          USER_IDS[persona],
          { status: 'active' },
          ROLE_COOKIES[persona]
        );
        assert.equal(response.status, 403, persona);
      }
    }
  );
});

test('an admin may block a user account', async () => {
  await withAuthenticatedApp(
    { userRepository: createFakeRepository(seedPersonaRows()) },
    async (base) => {
      const response = await patch(
        base,
        USER_IDS.user,
        { status: 'blocked' },
        ROLE_COOKIES.admin
      );
      assert.equal(response.status, 200);
      assert.equal((await json<PublicUser>(response)).status, 'blocked');
    }
  );
});

test('changing your own password needs your current password', async () => {
  await withAuthenticatedApp(
    { userRepository: createFakeRepository(seedPersonaRows()) },
    async (base) => {
      const change = { password: 'brand-new-pass' };
      const as = ROLE_COOKIES.user;

      assert.equal((await patch(base, USER_IDS.user, change, as)).status, 400);
      assert.equal(
        (
          await patch(
            base,
            USER_IDS.user,
            { ...change, currentPassword: 'not-the-password' },
            as
          )
        ).status,
        403
      );
      assert.equal(
        (
          await patch(
            base,
            USER_IDS.user,
            { ...change, currentPassword: PASSWORD },
            as
          )
        ).status,
        200
      );
    }
  );
});

test('changing your own email needs your current password too', async () => {
  await withAuthenticatedApp(
    { userRepository: createFakeRepository(seedPersonaRows()) },
    async (base) => {
      const change = { email: 'moved@example.com' };
      const as = ROLE_COOKIES.user;

      assert.equal((await patch(base, USER_IDS.user, change, as)).status, 400);
      assert.equal(
        (
          await patch(
            base,
            USER_IDS.user,
            { ...change, currentPassword: 'not-the-password' },
            as
          )
        ).status,
        403
      );
      assert.equal(
        (
          await patch(
            base,
            USER_IDS.user,
            { ...change, currentPassword: PASSWORD },
            as
          )
        ).status,
        200
      );
    }
  );
});

test("an admin changing a user's password needs no current password", async () => {
  await withAuthenticatedApp(
    { userRepository: createFakeRepository(seedPersonaRows()) },
    async (base) => {
      const response = await patch(
        base,
        USER_IDS.user,
        { password: 'reset-by-admin' },
        ROLE_COOKIES.admin
      );
      assert.equal(response.status, 200);
    }
  );
});

test('currentPassword alone is not a change', async () => {
  await withAuthenticatedApp(
    { userRepository: createFakeRepository(seedPersonaRows()) },
    async (base) => {
      const response = await patch(
        base,
        USER_IDS.user,
        { currentPassword: PASSWORD },
        ROLE_COOKIES.user
      );
      assert.equal(response.status, 400);
    }
  );
});

test('changing your own password clears the session cookie', async () => {
  await withAuthenticatedApp(
    { userRepository: createFakeRepository(seedPersonaRows()) },
    async (base) => {
      const response = await patch(
        base,
        USER_IDS.user,
        { password: 'brand-new-pass', currentPassword: PASSWORD },
        ROLE_COOKIES.user
      );

      assert.equal(response.status, 200);
      assert.match(
        response.headers.get('set-cookie') ?? '',
        new RegExp(`^${SESSION_COOKIE_NAME}=;`)
      );
    }
  );
});

test("an admin changing someone else's password keeps their own cookie", async () => {
  await withAuthenticatedApp(
    { userRepository: createFakeRepository(seedPersonaRows()) },
    async (base) => {
      const response = await patch(
        base,
        USER_IDS.user,
        { password: 'reset-by-admin' },
        ROLE_COOKIES.admin
      );

      assert.equal(response.status, 200);
      assert.equal(response.headers.get('set-cookie'), null);
    }
  );
});

test('currentPassword never reaches the stored row', async () => {
  // The fake applies every key it is handed, so a controller that forgot to
  // strip the proof would echo it straight back.
  await withAuthenticatedApp(
    { userRepository: createFakeRepository(seedPersonaRows()) },
    async (base) => {
      const response = await patch(
        base,
        USER_IDS.user,
        { email: 'kept@example.com', currentPassword: PASSWORD },
        ROLE_COOKIES.user
      );
      assert.equal(response.status, 200);
      assert.equal('currentPassword' in (await json<object>(response)), false);
    }
  );
});
