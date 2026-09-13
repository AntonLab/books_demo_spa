import test from 'node:test';
import assert from 'node:assert/strict';
import { StateConflictError } from '../types/errors.ts';
import type { ChapterRepository } from '../repositories/chapterRepository.ts';
import { createFakeChapterRepository } from '../repositories/chapterRepository.fake.testkit.ts';
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
// the fake's ownership lookups read this rather than hard-coding a persona.
const BOOK_CO_AUTHORS = new Map<number, number[]>([
  [KNOWN_BOOK_ID, [USER_IDS.author]],
  [SHARED_BOOK_ID, [USER_IDS.author, USER_IDS.otherAuthor]],
]);

// `inputs` records what the routes handed the repository. Publication rules and
// the version check are the real repository's, covered against MySQL; what the
// routes owe it is the validated body, which is what a test can check here.
const createFakeRepository = (inputs: unknown[] = []): ChapterRepository =>
  createFakeChapterRepository({ books: BOOK_CO_AUTHORS, inputs });

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

// Sends an expectedUpdatedAt unless the body names one: the fake repository
// does not compare versions, and a test about renaming should not have to
// spell one out. The requirement itself is pinned by its own test below.
const patch = (
  base: string,
  id: number,
  body: object,
  cookie: string | null = ROLE_COOKIES.author
) =>
  fetch(`${base}/api/chapters/${id}`, {
    method: 'PATCH',
    headers: {
      'content-type': 'application/json',
      ...(cookie ? { cookie } : {}),
    },
    body: JSON.stringify({
      expectedUpdatedAt: new Date().toISOString(),
      ...body,
    }),
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

// --- Publication time and the version check (CONTEXT.md). ---

test('POST passes the publication time through, a draft when omitted', async () => {
  const inputs: unknown[] = [];
  await withAuthenticatedApp(
    { chapterRepository: createFakeRepository(inputs) },
    async (base) => {
      const later = new Date(Date.now() + 86_400_000).toISOString();

      for (const publishedAt of ['now', later, null]) {
        assert.equal((await post(base, { ...valid, publishedAt })).status, 201);
      }
      assert.equal((await post(base, valid)).status, 201);

      assert.deepEqual(
        inputs.map((input) => (input as { publishedAt: unknown }).publishedAt),
        ['now', later, null, null]
      );
    }
  );
});

test('POST refuses a publication time that is neither now, a moment, nor null', async () => {
  await withAuthenticatedApp(
    { chapterRepository: createFakeRepository() },
    async (base) => {
      for (const publishedAt of ['tomorrow', 12, '2026-13-01']) {
        assert.equal((await post(base, { ...valid, publishedAt })).status, 400);
      }
    }
  );
});

test('PATCH without the updatedAt it was based on is a 400', async () => {
  await withAuthenticatedApp(
    { chapterRepository: createFakeRepository() },
    async (base) => {
      const { id } = await json<PublicChapter>(await post(base, valid));

      const response = await fetch(`${base}/api/chapters/${id}`, {
        method: 'PATCH',
        headers: {
          'content-type': 'application/json',
          cookie: ROLE_COOKIES.author,
        },
        body: JSON.stringify({ title: 'Renamed' }),
      });
      assert.equal(response.status, 400);
    }
  );
});

test('PATCH hands the repository the version and the publication time it was sent', async () => {
  const inputs: unknown[] = [];
  await withAuthenticatedApp(
    { chapterRepository: createFakeRepository(inputs) },
    async (base) => {
      const { id, updatedAt } = await json<PublicChapter>(
        await post(base, valid)
      );

      const response = await patch(base, id, {
        publishedAt: null,
        expectedUpdatedAt: updatedAt,
      });
      assert.equal(response.status, 200);
      assert.deepEqual(inputs.at(-1), {
        publishedAt: null,
        expectedUpdatedAt: updatedAt,
      });
    }
  );
});

test('a conflict from the repository reaches the caller as a 409', async () => {
  const repository = createFakeRepository();
  await withAuthenticatedApp(
    {
      chapterRepository: {
        ...repository,
        async update() {
          throw new StateConflictError(
            'This chapter was changed since you loaded it'
          );
        },
      },
    },
    async (base) => {
      const { id } = await json<PublicChapter>(await post(base, valid));

      const response = await patch(base, id, { text: 'Mine' });
      assert.equal(response.status, 409);
      assert.match(
        (await json<{ error: string }>(response)).error,
        /changed since you loaded it/
      );
    }
  );
});

// --- Reading order (CONTEXT.md). ---

const putOrder = (
  base: string,
  bookId: number,
  body: unknown,
  cookie: string | null = ROLE_COOKIES.author
) =>
  fetch(`${base}/api/books/${bookId}/chapter-order`, {
    method: 'PUT',
    headers: {
      'content-type': 'application/json',
      ...(cookie ? { cookie } : {}),
    },
    body: JSON.stringify(body),
  });

test('PUT chapter-order hands the repository the new Reading order and answers 204', async () => {
  const inputs: unknown[] = [];
  await withAuthenticatedApp(
    { chapterRepository: createFakeRepository(inputs) },
    async (base) => {
      const response = await putOrder(base, KNOWN_BOOK_ID, {
        chapterIds: [3, 1, 2],
      });

      assert.equal(response.status, 204);
      assert.deepEqual(inputs.at(-1), {
        bookId: KNOWN_BOOK_ID,
        chapterIds: [3, 1, 2],
      });
    }
  );
});

test('PUT chapter-order refuses an empty or repeating list with 400', async () => {
  await withAuthenticatedApp(
    { chapterRepository: createFakeRepository() },
    async (base) => {
      for (const chapterIds of [[], [1, 1], ['x']]) {
        assert.equal(
          (await putOrder(base, KNOWN_BOOK_ID, { chapterIds })).status,
          400
        );
      }
    }
  );
});

test('PUT chapter-order takes the permission to edit the book chapters', async () => {
  await withAuthenticatedApp(
    { chapterRepository: createFakeRepository() },
    async (base) => {
      const body = { chapterIds: [1, 2] };

      assert.equal(
        (await putOrder(base, KNOWN_BOOK_ID, body, null)).status,
        401
      );
      assert.equal(
        (await putOrder(base, KNOWN_BOOK_ID, body, ROLE_COOKIES.user)).status,
        403
      );
      assert.equal(
        (await putOrder(base, KNOWN_BOOK_ID, body, ROLE_COOKIES.otherAuthor))
          .status,
        403
      );
      assert.equal(
        (await putOrder(base, SHARED_BOOK_ID, body, ROLE_COOKIES.otherAuthor))
          .status,
        204
      );
      assert.equal(
        (await putOrder(base, KNOWN_BOOK_ID, body, ROLE_COOKIES.admin)).status,
        204
      );
    }
  );
});

test('PUT chapter-order on an unknown book is a 404, for a co-author and a moderator alike', async () => {
  await withAuthenticatedApp(
    { chapterRepository: createFakeRepository() },
    async (base) => {
      const body = { chapterIds: [1] };

      assert.equal((await putOrder(base, 999, body)).status, 404);
      assert.equal(
        (await putOrder(base, 999, body, ROLE_COOKIES.admin)).status,
        404
      );
    }
  );
});

test('a reorder conflict from the repository reaches the caller as a 409', async () => {
  const repository = createFakeRepository();
  await withAuthenticatedApp(
    {
      chapterRepository: {
        ...repository,
        async reorder() {
          throw new StateConflictError(
            'The chapters of this book changed since you loaded them'
          );
        },
      },
    },
    async (base) => {
      const response = await putOrder(base, KNOWN_BOOK_ID, {
        chapterIds: [1, 2],
      });

      assert.equal(response.status, 409);
      assert.match(
        (await json<{ error: string }>(response)).error,
        /changed since you loaded them/
      );
    }
  );
});
