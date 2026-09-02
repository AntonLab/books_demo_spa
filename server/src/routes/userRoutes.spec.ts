import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import { createApp } from '../app.ts';
import { ConflictError } from '../types/errors.ts';
import type {
  UserRepository,
  UserListResult,
} from '../repositories/userRepository.ts';
import type { PublicUser } from '../types/user.ts';
import type { ChapterRepository } from '../repositories/chapterRepository.ts';
import type { LikeRepository } from '../repositories/likeRepository.ts';
import type { SeriesRepository } from '../repositories/seriesRepository.ts';
import type { BookRepository } from '../repositories/bookRepository.ts';

function createFakeRepository(): UserRepository {
  const rows = new Map<number, PublicUser>();
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
  };
}

// createApp requires every repository, but no request in this file reaches
// /api/series or /api/books — stubs that throw keep that assumption honest.
function createUnusedRepository<T>(name: string): T {
  const unreachable = (): never => {
    throw new Error(`the ${name} repository must not be used by these tests`);
  };

  return {
    create: unreachable,
    list: unreachable,
    findById: unreachable,
    update: unreachable,
    remove: unreachable,
  } as T;
}

async function withServer(fn: (base: string) => Promise<void>): Promise<void> {
  const app = createApp({
    userRepository: createFakeRepository(),
    seriesRepository: createUnusedRepository<SeriesRepository>('series'),
    bookRepository: createUnusedRepository<BookRepository>('book'),
    chapterRepository: createUnusedRepository<ChapterRepository>('chapter'),
    likeRepository: createUnusedRepository<LikeRepository>('like'),
  });
  const server = app.listen(0);
  await once(server, 'listening');
  const { port } = server.address() as AddressInfo;

  try {
    await fn(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

const valid = {
  login: 'Bob',
  email: 'bob@example.com',
  password: 'hunter2hunter2',
  firstName: 'Bob',
  lastName: 'Bobsson',
};

const post = (base: string, body: unknown) =>
  fetch(`${base}/api/users`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

// undici's Body.json() returns Promise<unknown>; this is the single place the
// test narrows it, mirroring the validatedBody/Query/Params pattern in validate.ts.
async function json<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
}

test('POST creates a user and never echoes the password', async () => {
  await withServer(async (base) => {
    const response = await post(base, valid);
    const body = await json<{ login: string; status: string }>(response);

    assert.equal(response.status, 201);
    assert.equal(body.login, 'Bob');
    assert.equal(body.status, 'pending');
    assert.equal('password' in body, false);
  });
});

test('POST rejects an invalid email with 400', async () => {
  await withServer(async (base) => {
    const response = await post(base, { ...valid, email: 'nope' });

    assert.equal(response.status, 400);
    assert.match(
      (await json<{ error: string }>(response)).error,
      /validation/i
    );
  });
});

test('POST rejects a duplicate login with 409 naming the field', async () => {
  await withServer(async (base) => {
    await post(base, valid);
    const response = await post(base, { ...valid, email: 'other@example.com' });

    assert.equal(response.status, 409);
    assert.deepEqual((await json<{ details: unknown }>(response)).details, {
      field: 'login',
    });
  });
});

test('GET list returns items with the paging envelope', async () => {
  await withServer(async (base) => {
    await post(base, valid);
    const response = await fetch(`${base}/api/users`);
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
  });
});

test('GET by id returns 404 for a missing record', async () => {
  await withServer(async (base) => {
    const response = await fetch(`${base}/api/users/999`);

    assert.equal(response.status, 404);
  });
});

test('GET by id rejects a non-numeric id with 400', async () => {
  await withServer(async (base) => {
    const response = await fetch(`${base}/api/users/abc`);

    assert.equal(response.status, 400);
  });
});

test('PATCH updates one field', async () => {
  await withServer(async (base) => {
    const created = await json<{ id: number }>(await post(base, valid));
    const response = await fetch(`${base}/api/users/${created.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ firstName: 'Robert' }),
    });
    const body = await json<{ firstName: string; lastName: string }>(response);

    assert.equal(response.status, 200);
    assert.equal(body.firstName, 'Robert');
    assert.equal(body.lastName, 'Bobsson');
  });
});

test('PATCH rejects an empty body with 400', async () => {
  await withServer(async (base) => {
    const created = await json<{ id: number }>(await post(base, valid));
    const response = await fetch(`${base}/api/users/${created.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({}),
    });

    assert.equal(response.status, 400);
  });
});

test('DELETE returns 204 once and 404 afterwards', async () => {
  await withServer(async (base) => {
    const created = await json<{ id: number }>(await post(base, valid));

    assert.equal(
      (await fetch(`${base}/api/users/${created.id}`, { method: 'DELETE' }))
        .status,
      204
    );
    assert.equal(
      (await fetch(`${base}/api/users/${created.id}`, { method: 'DELETE' }))
        .status,
      404
    );
  });
});

test('an unknown route returns a JSON 404', async () => {
  await withServer(async (base) => {
    const response = await fetch(`${base}/api/nothing-here`);

    assert.equal(response.status, 404);
    assert.ok((await json<{ error: string }>(response)).error);
  });
});
