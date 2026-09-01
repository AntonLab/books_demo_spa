import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import { createApp } from '../app.ts';
import { NotFoundError } from '../types/errors.ts';
import type { BookRepository } from '../repositories/bookRepository.ts';
import type {
  ChapterListResult,
  ChapterRepository,
} from '../repositories/chapterRepository.ts';
import type { SeriesRepository } from '../repositories/seriesRepository.ts';
import type { UserRepository } from '../repositories/userRepository.ts';
import type { ChapterSummary, PublicChapter } from '../types/chapter.ts';

const KNOWN_BOOK_ID = 1;

function createFakeRepository(): ChapterRepository {
  const rows = new Map<number, PublicChapter>();
  let nextId = 1;

  return {
    async create(input) {
      // Stands in for the foreign key: the real repository maps MySQL's
      // rejection to this same NotFoundError.
      if (input.bookId !== KNOWN_BOOK_ID) {
        throw new NotFoundError('Book', input.bookId);
      }

      const now = new Date();
      const chapter: PublicChapter = {
        id: nextId,
        bookId: input.bookId,
        title: input.title,
        text: input.text,
        createdAt: now,
        updatedAt: now,
      };
      nextId += 1;
      rows.set(chapter.id, chapter);
      return chapter;
    },

    async list(query): Promise<ChapterListResult> {
      const all = [...rows.values()].filter(
        (row) =>
          (query.bookId === undefined || row.bookId === query.bookId) &&
          (!query.q ||
            row.title.includes(query.q) ||
            row.text.includes(query.q))
      );

      return {
        // Mirrors the real repository, which leaves the body out of the SELECT
        // rather than stripping it after the fact.
        items: all
          .slice(query.offset, query.offset + query.limit)
          .map(({ text: _text, ...summary }): ChapterSummary => summary),
        total: all.length,
      };
    },

    async findById(id) {
      return rows.get(id) ?? null;
    },

    async update(id, input) {
      const current = rows.get(id);
      if (!current) return null;

      const updated: PublicChapter = {
        ...current,
        title: input.title ?? current.title,
        text: input.text ?? current.text,
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

// No request in this file reaches the other three resources, but createApp
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
    bookRepository: createUnusedRepository<BookRepository>('book'),
    chapterRepository: createFakeRepository(),
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
  bookId: KNOWN_BOOK_ID,
  title: 'Chapter One',
  text: 'It was a dark night.',
};

const post = (base: string, body: unknown) =>
  fetch(`${base}/api/chapters`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

const patch = (base: string, id: number, body: unknown) =>
  fetch(`${base}/api/chapters/${id}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

const remove = (base: string, id: number) =>
  fetch(`${base}/api/chapters/${id}`, { method: 'DELETE' });

// undici's Body.json() returns Promise<unknown>; this is the single place the
// test narrows it, mirroring the validatedBody/Query/Params pattern in validate.ts.
async function json<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
}

test('POST creates a chapter and echoes its title and body', async () => {
  await withServer(async (base) => {
    const response = await post(base, valid);
    const body = await json<PublicChapter>(response);

    assert.equal(response.status, 201);
    assert.equal(body.bookId, KNOWN_BOOK_ID);
    assert.equal(body.title, 'Chapter One');
    assert.equal(body.text, 'It was a dark night.');
  });
});

test('POST trims the title before storing it', async () => {
  await withServer(async (base) => {
    const response = await post(base, { ...valid, title: '  Prologue  ' });

    assert.equal((await json<PublicChapter>(response)).title, 'Prologue');
  });
});

test('POST rejects a missing title with 400', async () => {
  await withServer(async (base) => {
    const response = await post(base, {
      bookId: KNOWN_BOOK_ID,
      text: 'No title',
    });

    assert.equal(response.status, 400);
    assert.match(
      (await json<{ error: string }>(response)).error,
      /validation/i
    );
  });
});

test('POST rejects a missing bookId with 400 — a chapter needs a book', async () => {
  await withServer(async (base) => {
    const response = await post(base, { title: 'Orphan', text: 'No book' });

    assert.equal(response.status, 400);
  });
});

test('POST against an unknown book is a 404, not a 500', async () => {
  await withServer(async (base) => {
    const response = await post(base, { ...valid, bookId: 999 });

    assert.equal(response.status, 404);
    assert.match(
      (await json<{ error: string }>(response)).error,
      /Book 999 not found/
    );
  });
});

test('GET / lists chapters without their bodies', async () => {
  await withServer(async (base) => {
    await post(base, valid);

    const response = await fetch(`${base}/api/chapters?bookId=1`);
    const body = await json<{ items: ChapterSummary[]; total: number }>(
      response
    );

    assert.equal(response.status, 200);
    assert.equal(body.total, 1);
    assert.equal(body.items[0]?.title, 'Chapter One');
    assert.ok(!('text' in (body.items[0] ?? {})));
  });
});

test('GET /:id returns the body the list withheld', async () => {
  await withServer(async (base) => {
    const created = await json<PublicChapter>(await post(base, valid));

    const response = await fetch(`${base}/api/chapters/${created.id}`);

    assert.equal(response.status, 200);
    assert.equal(
      (await json<PublicChapter>(response)).text,
      'It was a dark night.'
    );
  });
});

test('GET /:id for an unknown chapter is a 404', async () => {
  await withServer(async (base) => {
    const response = await fetch(`${base}/api/chapters/999`);

    assert.equal(response.status, 404);
    assert.match(
      (await json<{ error: string }>(response)).error,
      /Chapter 999 not found/
    );
  });
});

test('PATCH renames a chapter without touching its body', async () => {
  await withServer(async (base) => {
    const created = await json<PublicChapter>(await post(base, valid));

    const response = await patch(base, created.id, { title: 'Renamed' });
    const body = await json<PublicChapter>(response);

    assert.equal(response.status, 200);
    assert.equal(body.title, 'Renamed');
    assert.equal(body.text, 'It was a dark night.');
  });
});

test('PATCH rejects an empty body with 400', async () => {
  await withServer(async (base) => {
    const created = await json<PublicChapter>(await post(base, valid));

    assert.equal((await patch(base, created.id, {})).status, 400);
  });
});

test('PATCH ignores bookId — a chapter cannot be moved between books', async () => {
  await withServer(async (base) => {
    const created = await json<PublicChapter>(await post(base, valid));

    const body = await json<PublicChapter>(
      await patch(base, created.id, { bookId: 42, title: 'Renamed' })
    );

    assert.equal(body.bookId, KNOWN_BOOK_ID);
  });
});

test('DELETE removes a chapter, and a second attempt is a 404', async () => {
  await withServer(async (base) => {
    const created = await json<PublicChapter>(await post(base, valid));

    assert.equal((await remove(base, created.id)).status, 204);
    assert.equal((await remove(base, created.id)).status, 404);
  });
});
