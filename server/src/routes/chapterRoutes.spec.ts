import test from 'node:test';
import assert from 'node:assert/strict';
import { NotFoundError } from '../types/errors.ts';
import type {
  ChapterListResult,
  ChapterRepository,
} from '../repositories/chapterRepository.ts';
import type { ChapterSummary, PublicChapter } from '../types/chapter.ts';
import {
  json,
  ROLE_COOKIES,
  USER_IDS,
  withApp,
  withAuthenticatedApp,
} from './routeTestKit.testkit.ts';

const KNOWN_BOOK_ID = 1;
// Credited to both authors, so a spec can act as a co-author who did not
// create the book.
const SHARED_BOOK_ID = 2;

// Stands in for the books' credits: which books exist, and who co-authors
// each. A chapter has no owner of its own — its book's Co-authors own it — so
// both lookups below read this rather than hard-coding a persona.
const BOOK_CO_AUTHORS = new Map<number, number[]>([
  [KNOWN_BOOK_ID, [USER_IDS.author]],
  [SHARED_BOOK_ID, [USER_IDS.author, USER_IDS.otherAuthor]],
]);

function createFakeRepository(): ChapterRepository {
  const rows = new Map<number, PublicChapter>();
  let nextId = 1;

  return {
    async create(input) {
      // Stands in for the foreign key: the real repository maps MySQL's
      // rejection to this same NotFoundError.
      if (!BOOK_CO_AUTHORS.has(input.bookId)) {
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

    // Mirrors the real repository, which resolves a chapter's Co-authors
    // through the book it is stored under.
    async findCoAuthorIds(id) {
      const chapter = rows.get(id);
      return chapter ? (BOOK_CO_AUTHORS.get(chapter.bookId) ?? null) : null;
    },

    async findBookCoAuthorIds(bookId) {
      return BOOK_CO_AUTHORS.get(bookId) ?? null;
    },
  };
}

const valid = {
  bookId: KNOWN_BOOK_ID,
  title: 'Chapter One',
  text: 'It was a dark night.',
};

// Defaults to the author persona: create, update and delete all need `own` or
// `any` scope on chapters, and `user` has `none` on all three, so AUTH_COOKIE
// (the `user` persona) is not a usable default for a write in this file.
const post = (
  base: string,
  body: unknown,
  cookie: string | null = ROLE_COOKIES.author
) =>
  fetch(`${base}/api/chapters`, {
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
  cookie: string | null = ROLE_COOKIES.author
) =>
  fetch(`${base}/api/chapters/${id}`, {
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
  cookie: string | null = ROLE_COOKIES.author
) =>
  fetch(`${base}/api/chapters/${id}`, {
    method: 'DELETE',
    ...(cookie ? { headers: { cookie } } : {}),
  });

test('POST creates a chapter and echoes its title and body', async () => {
  await withAuthenticatedApp(
    { chapterRepository: createFakeRepository() },
    async (base) => {
      const response = await post(base, valid);
      const body = await json<PublicChapter>(response);

      assert.equal(response.status, 201);
      assert.equal(body.bookId, KNOWN_BOOK_ID);
      assert.equal(body.title, 'Chapter One');
      assert.equal(body.text, 'It was a dark night.');
    }
  );
});

test('POST trims the title before storing it', async () => {
  await withAuthenticatedApp(
    { chapterRepository: createFakeRepository() },
    async (base) => {
      const response = await post(base, { ...valid, title: '  Prologue  ' });

      assert.equal((await json<PublicChapter>(response)).title, 'Prologue');
    }
  );
});

test('POST rejects a missing title with 400', async () => {
  await withAuthenticatedApp(
    { chapterRepository: createFakeRepository() },
    async (base) => {
      const response = await post(base, {
        bookId: KNOWN_BOOK_ID,
        text: 'No title',
      });

      assert.equal(response.status, 400);
      assert.match(
        (await json<{ error: string }>(response)).error,
        /validation/i
      );
    }
  );
});

test('POST rejects a missing bookId with 400 — a chapter needs a book', async () => {
  await withAuthenticatedApp(
    { chapterRepository: createFakeRepository() },
    async (base) => {
      const response = await post(base, { title: 'Orphan', text: 'No book' });

      assert.equal(response.status, 400);
    }
  );
});

test('POST against an unknown book is a 404, not a 500', async () => {
  await withAuthenticatedApp(
    { chapterRepository: createFakeRepository() },
    async (base) => {
      const response = await post(base, { ...valid, bookId: 999 });

      assert.equal(response.status, 404);
      assert.match(
        (await json<{ error: string }>(response)).error,
        /Book 999 not found/
      );
    }
  );
});

test('GET / lists chapters without their bodies', async () => {
  await withAuthenticatedApp(
    { chapterRepository: createFakeRepository() },
    async (base) => {
      await post(base, valid);

      const response = await fetch(`${base}/api/chapters?bookId=1`);
      const body = await json<{ items: ChapterSummary[]; total: number }>(
        response
      );

      assert.equal(response.status, 200);
      assert.equal(body.total, 1);
      assert.equal(body.items[0]?.title, 'Chapter One');
      assert.ok(!('text' in (body.items[0] ?? {})));
    }
  );
});

test('GET /:id returns the body the list withheld', async () => {
  await withAuthenticatedApp(
    { chapterRepository: createFakeRepository() },
    async (base) => {
      const created = await json<PublicChapter>(await post(base, valid));

      const response = await fetch(`${base}/api/chapters/${created.id}`);

      assert.equal(response.status, 200);
      assert.equal(
        (await json<PublicChapter>(response)).text,
        'It was a dark night.'
      );
    }
  );
});

test('GET /:id for an unknown chapter is a 404', async () => {
  await withAuthenticatedApp(
    { chapterRepository: createFakeRepository() },
    async (base) => {
      const response = await fetch(`${base}/api/chapters/999`);

      assert.equal(response.status, 404);
      assert.match(
        (await json<{ error: string }>(response)).error,
        /Chapter 999 not found/
      );
    }
  );
});

test('PATCH renames a chapter without touching its body', async () => {
  await withAuthenticatedApp(
    { chapterRepository: createFakeRepository() },
    async (base) => {
      const created = await json<PublicChapter>(await post(base, valid));

      const response = await patch(base, created.id, { title: 'Renamed' });
      const body = await json<PublicChapter>(response);

      assert.equal(response.status, 200);
      assert.equal(body.title, 'Renamed');
      assert.equal(body.text, 'It was a dark night.');
    }
  );
});

test('PATCH rejects an empty body with 400', async () => {
  await withAuthenticatedApp(
    { chapterRepository: createFakeRepository() },
    async (base) => {
      const created = await json<PublicChapter>(await post(base, valid));

      assert.equal((await patch(base, created.id, {})).status, 400);
    }
  );
});

test('PATCH ignores bookId — a chapter cannot be moved between books', async () => {
  await withAuthenticatedApp(
    { chapterRepository: createFakeRepository() },
    async (base) => {
      const created = await json<PublicChapter>(await post(base, valid));

      const body = await json<PublicChapter>(
        await patch(base, created.id, { bookId: 42, title: 'Renamed' })
      );

      assert.equal(body.bookId, KNOWN_BOOK_ID);
    }
  );
});

test('DELETE removes a chapter, and a second attempt is a 404', async () => {
  await withAuthenticatedApp(
    { chapterRepository: createFakeRepository() },
    async (base) => {
      const created = await json<PublicChapter>(await post(base, valid));

      assert.equal((await remove(base, created.id)).status, 204);
      assert.equal((await remove(base, created.id)).status, 404);
    }
  );
});

test('POST without a session is 401', async () => {
  await withApp({ chapterRepository: createFakeRepository() }, async (base) => {
    assert.equal((await post(base, valid, null)).status, 401);
  });
});

test('PATCH without a session is 401', async () => {
  await withApp({ chapterRepository: createFakeRepository() }, async (base) => {
    assert.equal((await patch(base, 1, { title: 'New' }, null)).status, 401);
  });
});

test('DELETE without a session is 401', async () => {
  await withApp({ chapterRepository: createFakeRepository() }, async (base) => {
    assert.equal((await remove(base, 1, null)).status, 401);
  });
});

test('GET stays public', async () => {
  await withApp({ chapterRepository: createFakeRepository() }, async (base) => {
    assert.equal((await fetch(`${base}/api/chapters`)).status, 200);
  });
});

// --- The permission matrix: who may create, edit and delete a chapter. ---

test('an author adds a chapter to their own book', async () => {
  await withAuthenticatedApp(
    { chapterRepository: createFakeRepository() },
    async (base) => {
      assert.equal((await post(base, valid, ROLE_COOKIES.author)).status, 201);
    }
  );
});

test('an author may not add a chapter to another author book', async () => {
  // The hole this closes: gating books alone would leave the neighbouring
  // endpoint open, and anyone could append to someone else's book.
  await withAuthenticatedApp(
    { chapterRepository: createFakeRepository() },
    async (base) => {
      const response = await post(base, valid, ROLE_COOKIES.otherAuthor);
      assert.equal(response.status, 403);
    }
  );
});

test('a plain user may not add a chapter at all', async () => {
  await withAuthenticatedApp(
    { chapterRepository: createFakeRepository() },
    async (base) => {
      assert.equal((await post(base, valid, ROLE_COOKIES.user)).status, 403);
    }
  );
});

test('an admin may edit any chapter but create none', async () => {
  await withAuthenticatedApp(
    { chapterRepository: createFakeRepository() },
    async (base) => {
      assert.equal((await post(base, valid, ROLE_COOKIES.admin)).status, 403);

      const created = await json<PublicChapter>(
        await post(base, valid, ROLE_COOKIES.author)
      );
      assert.equal(
        (await patch(base, created.id, { title: 'Fixed' }, ROLE_COOKIES.admin))
          .status,
        200
      );
    }
  );
});

test('an author may not edit a chapter in another author book', async () => {
  await withAuthenticatedApp(
    { chapterRepository: createFakeRepository() },
    async (base) => {
      const created = await json<PublicChapter>(
        await post(base, valid, ROLE_COOKIES.author)
      );

      const response = await patch(
        base,
        created.id,
        { title: 'Hijacked' },
        ROLE_COOKIES.otherAuthor
      );
      assert.equal(response.status, 403);

      const stored = await json<PublicChapter>(
        await fetch(`${base}/api/chapters/${created.id}`)
      );
      assert.equal(stored.title, 'Chapter One');
    }
  );
});

test('an author may not delete a chapter in another author book', async () => {
  await withAuthenticatedApp(
    { chapterRepository: createFakeRepository() },
    async (base) => {
      const created = await json<PublicChapter>(
        await post(base, valid, ROLE_COOKIES.author)
      );

      const response = await remove(base, created.id, ROLE_COOKIES.otherAuthor);
      assert.equal(response.status, 403);

      // The row must survive the refused attempt, not just the status code.
      const stillThere = await fetch(`${base}/api/chapters/${created.id}`);
      assert.equal(stillThere.status, 200);
    }
  );
});

test('an admin may delete a chapter in another author book', async () => {
  await withAuthenticatedApp(
    { chapterRepository: createFakeRepository() },
    async (base) => {
      const created = await json<PublicChapter>(
        await post(base, valid, ROLE_COOKIES.author)
      );

      assert.equal(
        (await remove(base, created.id, ROLE_COOKIES.admin)).status,
        204
      );
    }
  );
});

// --- A book's chapters belong to every one of its Co-authors (ADR-0005). ---

test('a co-author who did not create the book may add and edit its chapters', async () => {
  await withAuthenticatedApp(
    { chapterRepository: createFakeRepository() },
    async (base) => {
      const created = await post(
        base,
        { ...valid, bookId: SHARED_BOOK_ID },
        ROLE_COOKIES.otherAuthor
      );
      assert.equal(created.status, 201);

      const { id } = await json<PublicChapter>(created);
      const edited = await patch(
        base,
        id,
        { title: 'Renamed' },
        ROLE_COOKIES.otherAuthor
      );
      assert.equal(edited.status, 200);
      assert.equal((await remove(base, id, ROLE_COOKIES.author)).status, 204);
    }
  );
});
