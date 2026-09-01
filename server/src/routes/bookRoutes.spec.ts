import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import { createApp } from '../app.ts';
import { NotFoundError } from '../types/errors.ts';
import type {
  BookListResult,
  BookRepository,
} from '../repositories/bookRepository.ts';
import type { ChapterRepository } from '../repositories/chapterRepository.ts';
import type { SeriesRepository } from '../repositories/seriesRepository.ts';
import type { UserRepository } from '../repositories/userRepository.ts';
import type { PublicBook } from '../types/book.ts';

const KNOWN_USER_ID = 1;
const KNOWN_SERIES_ID = 7;

function createFakeRepository(): BookRepository {
  const rows = new Map<number, PublicBook>();
  let nextId = 1;

  return {
    async create(input) {
      // Stands in for the foreign keys: the real repository maps MySQL's
      // rejections to these same NotFoundErrors, blaming the column at fault.
      if (input.userId !== KNOWN_USER_ID) {
        throw new NotFoundError('User', input.userId);
      }
      if (input.seriesId !== null && input.seriesId !== KNOWN_SERIES_ID) {
        throw new NotFoundError('Series', input.seriesId);
      }

      const now = new Date();
      const book: PublicBook = {
        id: nextId,
        userId: input.userId,
        seriesId: input.seriesId,
        description: input.description,
        tags: input.tags,
        createdAt: now,
        updatedAt: now,
      };
      nextId += 1;
      rows.set(book.id, book);
      return book;
    },

    async list(query): Promise<BookListResult> {
      const all = [...rows.values()].filter(
        (row) =>
          (query.userId === undefined || row.userId === query.userId) &&
          (query.seriesId === undefined || row.seriesId === query.seriesId) &&
          (!query.tag || row.tags.includes(query.tag)) &&
          (!query.q || row.description.includes(query.q))
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
      if (
        input.seriesId !== null &&
        input.seriesId !== undefined &&
        input.seriesId !== KNOWN_SERIES_ID
      ) {
        throw new NotFoundError('Series', input.seriesId);
      }

      const updated: PublicBook = {
        ...current,
        // `in` rather than `??`: an explicit null means "unlink", which a
        // nullish fallback would silently turn into "leave it alone".
        seriesId:
          'seriesId' in input ? (input.seriesId ?? null) : current.seriesId,
        description: input.description ?? current.description,
        tags: input.tags ?? current.tags,
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

// No request in this file reaches /api/users or /api/series, but createApp
// requires the dependencies — stubs that throw keep that assumption honest.
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
    userRepository: createUnusedRepository<UserRepository>('user'),
    seriesRepository: createUnusedRepository<SeriesRepository>('series'),
    bookRepository: createFakeRepository(),
    chapterRepository: createUnusedRepository<ChapterRepository>('chapter'),
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
  userId: KNOWN_USER_ID,
  seriesId: KNOWN_SERIES_ID,
  description: 'The first book in the trilogy',
  tags: ['sci-fi', 'epic'],
};

const post = (base: string, body: unknown) =>
  fetch(`${base}/api/books`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

const patch = (base: string, id: number, body: unknown) =>
  fetch(`${base}/api/books/${id}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

// undici's Body.json() returns Promise<unknown>; this is the single place the
// test narrows it, mirroring the validatedBody/Query/Params pattern in validate.ts.
async function json<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
}

test('POST creates a book and echoes its tags and series', async () => {
  await withServer(async (base) => {
    const response = await post(base, valid);
    const body = await json<PublicBook>(response);

    assert.equal(response.status, 201);
    assert.equal(body.userId, KNOWN_USER_ID);
    assert.equal(body.seriesId, KNOWN_SERIES_ID);
    assert.deepEqual(body.tags, ['sci-fi', 'epic']);
  });
});

test('POST defaults seriesId to null when omitted — a book need not be in a series', async () => {
  await withServer(async (base) => {
    const response = await post(base, {
      userId: KNOWN_USER_ID,
      description: 'Standalone',
    });

    assert.equal(response.status, 201);
    assert.equal((await json<PublicBook>(response)).seriesId, null);
  });
});

test('POST defaults tags to an empty array when omitted', async () => {
  await withServer(async (base) => {
    const response = await post(base, {
      userId: KNOWN_USER_ID,
      description: 'No tags yet',
    });

    assert.equal(response.status, 201);
    assert.deepEqual((await json<PublicBook>(response)).tags, []);
  });
});

test('POST collapses duplicate tags before storing them', async () => {
  await withServer(async (base) => {
    const response = await post(base, {
      ...valid,
      tags: ['epic', 'epic', 'sci-fi'],
    });

    assert.deepEqual((await json<PublicBook>(response)).tags, [
      'epic',
      'sci-fi',
    ]);
  });
});

test('POST rejects a missing description with 400', async () => {
  await withServer(async (base) => {
    const response = await post(base, { userId: KNOWN_USER_ID });

    assert.equal(response.status, 400);
    assert.match(
      (await json<{ error: string }>(response)).error,
      /validation/i
    );
  });
});

test('POST rejects a non-numeric seriesId with 400', async () => {
  await withServer(async (base) => {
    const response = await post(base, { ...valid, seriesId: 'abc' });

    assert.equal(response.status, 400);
  });
});

test('POST against an unknown user is a 404, not a 500', async () => {
  await withServer(async (base) => {
    const response = await post(base, { ...valid, userId: 999 });

    assert.equal(response.status, 404);
    assert.match(
      (await json<{ error: string }>(response)).error,
      /User 999 not found/
    );
  });
});

test('POST against an unknown series blames the series, not the user', async () => {
  await withServer(async (base) => {
    const response = await post(base, { ...valid, seriesId: 999 });

    assert.equal(response.status, 404);
    assert.match(
      (await json<{ error: string }>(response)).error,
      /Series 999 not found/
    );
  });
});

test('GET list returns items with the paging envelope', async () => {
  await withServer(async (base) => {
    await post(base, valid);
    const response = await fetch(`${base}/api/books`);
    const body = await json<{
      total: number;
      limit: number;
      offset: number;
      items: unknown[];
    }>(response);

    assert.equal(response.status, 200);
    assert.deepEqual(
      { total: body.total, limit: body.limit, offset: body.offset },
      { total: 1, limit: 20, offset: 0 }
    );
    assert.equal(body.items.length, 1);
  });
});

test('GET list filters by tag, owner and series', async () => {
  await withServer(async (base) => {
    await post(base, valid);
    await post(base, {
      userId: KNOWN_USER_ID,
      description: 'Standalone',
      tags: ['drama'],
    });

    const byTag = await json<{ total: number }>(
      await fetch(`${base}/api/books?tag=drama`)
    );
    const byUser = await json<{ total: number }>(
      await fetch(`${base}/api/books?userId=${KNOWN_USER_ID}`)
    );
    const bySeries = await json<{ total: number }>(
      await fetch(`${base}/api/books?seriesId=${KNOWN_SERIES_ID}`)
    );
    const byOther = await json<{ total: number }>(
      await fetch(`${base}/api/books?userId=2`)
    );

    assert.equal(byTag.total, 1);
    assert.equal(byUser.total, 2);
    // The standalone book has no series, so only one of the two matches.
    assert.equal(bySeries.total, 1);
    assert.equal(byOther.total, 0);
  });
});

test('GET by id returns 404 for a missing record', async () => {
  await withServer(async (base) => {
    assert.equal((await fetch(`${base}/api/books/999`)).status, 404);
  });
});

test('GET by id rejects a non-numeric id with 400', async () => {
  await withServer(async (base) => {
    assert.equal((await fetch(`${base}/api/books/abc`)).status, 400);
  });
});

test('PATCH replaces tags but leaves them alone when omitted', async () => {
  await withServer(async (base) => {
    const { id } = await json<PublicBook>(await post(base, valid));

    const retagged = await json<PublicBook>(
      await patch(base, id, { tags: ['drama'] })
    );
    assert.deepEqual(retagged.tags, ['drama']);

    const renamed = await json<PublicBook>(
      await patch(base, id, { description: 'Rewritten' })
    );
    assert.equal(renamed.description, 'Rewritten');
    assert.deepEqual(renamed.tags, ['drama']);
  });
});

// The interesting case: `.partial()` does not undo `.default()`, so a PATCH
// schema derived from the create schema would parse this body as
// `seriesId: null` and silently unlink the book.
test('PATCH omitting seriesId leaves the book in its series', async () => {
  await withServer(async (base) => {
    const { id } = await json<PublicBook>(await post(base, valid));

    const patched = await json<PublicBook>(
      await patch(base, id, { description: 'Rewritten' })
    );

    assert.equal(patched.seriesId, KNOWN_SERIES_ID);
  });
});

test('PATCH with an explicit null seriesId unlinks the book', async () => {
  await withServer(async (base) => {
    const { id } = await json<PublicBook>(await post(base, valid));

    const patched = await json<PublicBook>(
      await patch(base, id, { seriesId: null })
    );

    assert.equal(patched.seriesId, null);
  });
});

test('PATCH cannot re-parent a book to another user', async () => {
  await withServer(async (base) => {
    const { id } = await json<PublicBook>(await post(base, valid));

    // userId is not in updateBookSchema, so a body carrying only it has no
    // recognised keys and fails the "at least one field" refinement.
    const response = await patch(base, id, { userId: 2 });

    assert.equal(response.status, 400);
  });
});

test('PATCH with an empty body is a 400', async () => {
  await withServer(async (base) => {
    const { id } = await json<PublicBook>(await post(base, valid));

    assert.equal((await patch(base, id, {})).status, 400);
  });
});

test('PATCH on a missing record is a 404', async () => {
  await withServer(async (base) => {
    assert.equal((await patch(base, 999, { tags: [] })).status, 404);
  });
});

test('DELETE removes the book, then reports 404 on a second attempt', async () => {
  await withServer(async (base) => {
    const { id } = await json<PublicBook>(await post(base, valid));

    const first = await fetch(`${base}/api/books/${id}`, { method: 'DELETE' });
    const second = await fetch(`${base}/api/books/${id}`, { method: 'DELETE' });

    assert.equal(first.status, 204);
    assert.equal(second.status, 404);
  });
});
