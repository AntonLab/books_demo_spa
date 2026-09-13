import test from 'node:test';
import assert from 'node:assert/strict';
import { NotFoundError, StateConflictError } from '../types/errors.ts';
import type {
  BookListResult,
  BookRepository,
} from '../repositories/bookRepository.ts';
import type { Viewer } from '../repositories/visibility.ts';
import type { BookDetail, PublicBook } from '../types/book.ts';
import type { AuthorSummary } from '../types/user.ts';
import {
  AUTH_COOKIE,
  json,
  ROLE_COOKIES,
  USER_IDS,
  withApp,
  withAuthenticatedApp,
} from './routeTestKit.testkit.ts';

// Every book in this suite is created by the `author` persona by default —
// only `author` (and `admin`, on update/delete) has anything but `none` on
// books in the matrix — so the "known valid user" the fake repository accepts
// is that persona's id, not an arbitrary constant.
const KNOWN_USER_ID = USER_IDS.author;
const KNOWN_SERIES_ID = 7;
// A series that exists but belongs to `otherAuthor`, not to the `author`
// persona every book here is created by — the target an author must not be
// able to file a book under.
const OTHER_AUTHOR_SERIES_ID = 8;
const VIEWER_LIKE_ID = 99;
const UNOWNED_USER_ID = 999997;

// Credited to otherAuthor first and the `author` persona second, so filing a
// book under it proves any Co-author of a series may, not only its first.
const SHARED_SERIES_ID = 9;

// Stands in for the series' credits: which series exist, and who co-authors
// each.
const SERIES_CO_AUTHORS = new Map<number, number[]>([
  [KNOWN_SERIES_ID, [KNOWN_USER_ID]],
  [OTHER_AUTHOR_SERIES_ID, [USER_IDS.otherAuthor]],
  [SHARED_SERIES_ID, [USER_IDS.otherAuthor, KNOWN_USER_ID]],
]);

// Deliberately spelled out rather than derived from a PublicUser: the point of
// the assertion below is that no email reaches the response, and a fixture
// built by deleting a key would not prove that.
const AUTHOR: AuthorSummary = {
  id: KNOWN_USER_ID,
  login: 'Author',
  firstName: 'Ann',
  lastName: 'Author',
};

// Every persona a fake credit can name, so a response's `authors` carries real
// summaries rather than ids.
const SUMMARIES = new Map<number, AuthorSummary>([
  [KNOWN_USER_ID, AUTHOR],
  [
    USER_IDS.otherAuthor,
    {
      id: USER_IDS.otherAuthor,
      login: 'otherAuthor',
      firstName: 'O',
      lastName: 'A',
    },
  ],
  [
    USER_IDS.user,
    {
      id: USER_IDS.user,
      login: 'TestUser',
      firstName: 'Test',
      lastName: 'User',
    },
  ],
]);

// `viewers` collects who each read was made as. Whether a Draft book is
// readable is the real repository's decision, covered against MySQL; what the
// routes owe it is the right viewer, which is what a test can check here.
function createFakeRepository(
  viewers: Viewer[] = [],
  reorders: unknown[] = []
): BookRepository {
  const rows = new Map<number, PublicBook>();
  // bookId -> co-author ids, in credit order. The domain rules on credits (the
  // author role, duplicates, the last co-author) belong to the real repository
  // and are covered against MySQL; this fake only keeps the list.
  const credits = new Map<number, number[]>();
  let nextId = 1;

  const withCredits = (book: PublicBook): PublicBook => ({
    ...book,
    authors: (credits.get(book.id) ?? []).flatMap(
      (id) => SUMMARIES.get(id) ?? []
    ),
  });

  return {
    async create(input) {
      // Stands in for the foreign keys: the real repository maps MySQL's
      // rejections to these same NotFoundErrors, blaming the column at fault.
      if (input.userId !== KNOWN_USER_ID) {
        throw new NotFoundError('User', input.userId);
      }
      if (input.seriesId !== null && !SERIES_CO_AUTHORS.has(input.seriesId)) {
        throw new NotFoundError('Series', input.seriesId);
      }

      const now = new Date();
      const book: PublicBook = {
        id: nextId,
        authors: [],
        status: 'draft',
        seriesId: input.seriesId,
        title: input.title,
        description: input.description,
        tags: input.tags,
        createdAt: now,
        updatedAt: now,
      };
      nextId += 1;
      rows.set(book.id, book);
      credits.set(book.id, [input.userId]);
      return withCredits(book);
    },

    async list(query, viewer): Promise<BookListResult> {
      viewers.push(viewer);
      const all = [...rows.values()].filter(
        (row) =>
          (query.userId === undefined ||
            (credits.get(row.id) ?? []).includes(query.userId)) &&
          (query.seriesId === undefined || row.seriesId === query.seriesId) &&
          (!query.tag || row.tags.includes(query.tag)) &&
          (!query.q || row.description.includes(query.q))
      );
      return {
        items: all
          .slice(query.offset, query.offset + query.limit)
          .map(withCredits),
        total: all.length,
      };
    },

    async findById(id) {
      const book = rows.get(id);
      return book ? withCredits(book) : null;
    },

    async findDetailById(id, viewer) {
      viewers.push(viewer);
      const book = rows.get(id);
      if (!book) return null;

      return {
        ...withCredits(book),
        series: { id: KNOWN_SERIES_ID, title: 'The Cycle' },
        likeCount: 4,
        // Stands in for the real repository's viewer lookup: only a signed-in
        // caller can have a like of their own to report.
        viewerLikeId: viewer === null ? null : VIEWER_LIKE_ID,
      };
    },

    async update(id, input) {
      const current = rows.get(id);
      if (!current) return null;
      if (
        input.seriesId !== null &&
        input.seriesId !== undefined &&
        !SERIES_CO_AUTHORS.has(input.seriesId)
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
        status: input.status ?? current.status,
        updatedAt: new Date(),
      };
      rows.set(id, updated);
      return withCredits(updated);
    },

    async remove(id) {
      credits.delete(id);
      return rows.delete(id);
    },

    async addCoAuthor(bookId, userId) {
      const book = rows.get(bookId);
      if (!book) return null;
      credits.set(bookId, [...(credits.get(bookId) ?? []), userId]);
      return withCredits(book);
    },

    async removeCoAuthor(bookId, userId) {
      const book = rows.get(bookId);
      if (!book) return null;
      credits.set(
        bookId,
        (credits.get(bookId) ?? []).filter((id) => id !== userId)
      );
      return withCredits(book);
    },

    async findCoAuthorIds(id) {
      return credits.get(id) ?? null;
    },

    async findSeriesCoAuthorIds(seriesId) {
      return SERIES_CO_AUTHORS.get(seriesId) ?? null;
    },

    // The books filed under each series, in Series order; the append and the
    // set comparison behind a 409 are the real repository's, covered against
    // MySQL.
    async listInSeries(seriesId) {
      if (!SERIES_CO_AUTHORS.has(seriesId)) return null;
      return [...rows.values()]
        .filter((row) => row.seriesId === seriesId)
        .map((row) => {
          const { id, title, status, authors } = withCredits(row);
          return { id, title, status, authors };
        });
    },

    async reorderInSeries(seriesId, bookIds) {
      reorders.push({ seriesId, bookIds });
      return SERIES_CO_AUTHORS.has(seriesId);
    },
  };
}

// No userId: the first Co-author comes from the session, never the body.
const valid = {
  seriesId: KNOWN_SERIES_ID,
  title: 'The First Book',
  description: 'The first book in the trilogy',
  tags: ['sci-fi', 'epic'],
};

// Defaults to the author persona: create and update both need `own` or `any`
// scope on books, and `user` has `none` on all three, so AUTH_COOKIE (the
// `user` persona) is no longer a usable default for a write in this file.
const post = (
  base: string,
  body: unknown,
  cookie: string | null = ROLE_COOKIES.author
) =>
  fetch(`${base}/api/books`, {
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
  fetch(`${base}/api/books/${id}`, {
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
  fetch(`${base}/api/books/${id}`, {
    method: 'DELETE',
    headers: {
      ...(cookie ? { cookie } : {}),
    },
  });

test('POST creates a book credited to the caller and echoes its tags and series', async () => {
  await withAuthenticatedApp(
    { bookRepository: createFakeRepository() },
    async (base) => {
      const response = await post(base, valid);
      const body = await json<PublicBook>(response);

      assert.equal(response.status, 201);
      assert.deepEqual(
        body.authors.map((author) => author.id),
        [KNOWN_USER_ID]
      );
      assert.equal(body.seriesId, KNOWN_SERIES_ID);
      assert.deepEqual(body.tags, ['sci-fi', 'epic']);
    }
  );
});

test('POST defaults seriesId to null when omitted — a book need not be in a series', async () => {
  await withAuthenticatedApp(
    { bookRepository: createFakeRepository() },
    async (base) => {
      const response = await post(base, {
        title: 'Standalone',
        description: 'Standalone',
      });

      assert.equal(response.status, 201);
      assert.equal((await json<PublicBook>(response)).seriesId, null);
    }
  );
});

test('POST defaults tags to an empty array when omitted', async () => {
  await withAuthenticatedApp(
    { bookRepository: createFakeRepository() },
    async (base) => {
      const response = await post(base, {
        title: 'No Tags Yet',
        description: 'No tags yet',
      });

      assert.equal(response.status, 201);
      assert.deepEqual((await json<PublicBook>(response)).tags, []);
    }
  );
});

test('POST collapses duplicate tags before storing them', async () => {
  await withAuthenticatedApp(
    { bookRepository: createFakeRepository() },
    async (base) => {
      const response = await post(base, {
        ...valid,
        tags: ['epic', 'epic', 'sci-fi'],
      });

      assert.deepEqual((await json<PublicBook>(response)).tags, [
        'epic',
        'sci-fi',
      ]);
    }
  );
});

test('POST rejects a missing description with 400', async () => {
  await withAuthenticatedApp(
    { bookRepository: createFakeRepository() },
    async (base) => {
      const response = await post(base, {});

      assert.equal(response.status, 400);
      assert.match(
        (await json<{ error: string }>(response)).error,
        /validation/i
      );
    }
  );
});

test('POST rejects a non-numeric seriesId with 400', async () => {
  await withAuthenticatedApp(
    { bookRepository: createFakeRepository() },
    async (base) => {
      const response = await post(base, { ...valid, seriesId: 'abc' });

      assert.equal(response.status, 400);
    }
  );
});

// There is no longer a route-level way to reach an "unknown user" 404: userId
// is not client-controlled, and authStubs only ever resolves known personas.
// The repository-level mapping from a rejected FK to NotFoundError is still
// covered directly in bookRepository.spec.ts.

test('POST against an unknown series blames the series, not the user', async () => {
  await withAuthenticatedApp(
    { bookRepository: createFakeRepository() },
    async (base) => {
      const response = await post(base, { ...valid, seriesId: 999 });

      assert.equal(response.status, 404);
      assert.match(
        (await json<{ error: string }>(response)).error,
        /Series 999 not found/
      );
    }
  );
});

test('GET list returns items with the paging envelope', async () => {
  await withAuthenticatedApp(
    { bookRepository: createFakeRepository() },
    async (base) => {
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
    }
  );
});

test('GET list filters by tag, owner and series', async () => {
  await withAuthenticatedApp(
    { bookRepository: createFakeRepository() },
    async (base) => {
      await post(base, valid);
      await post(base, {
        title: 'Standalone',
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
        await fetch(`${base}/api/books?userId=${UNOWNED_USER_ID}`)
      );

      assert.equal(byTag.total, 1);
      assert.equal(byUser.total, 2);
      // The standalone book has no series, so only one of the two matches.
      assert.equal(bySeries.total, 1);
      assert.equal(byOther.total, 0);
    }
  );
});

test('GET by id embeds the co-authors and series, and never an email', async () => {
  // Seeded through the authenticated harness because POST is guarded, then read
  // back with no cookie at all: that is what proves the detail read stays
  // public and that an anonymous visitor gets an empty viewerLikeId.
  await withAuthenticatedApp(
    { bookRepository: createFakeRepository() },
    async (base) => {
      await post(base, valid);

      const response = await fetch(`${base}/api/books/1`);
      assert.equal(response.status, 200);

      const body = await json<BookDetail>(response);
      assert.equal(body.authors[0]?.login, 'Author');
      assert.equal('email' in (body.authors[0] ?? {}), false);
      assert.equal(body.series?.title, 'The Cycle');
      assert.equal(body.likeCount, 4);
      assert.equal(body.viewerLikeId, null);
    }
  );
});

test('GET by id reports the viewer own like when signed in', async () => {
  await withAuthenticatedApp(
    { bookRepository: createFakeRepository() },
    async (base) => {
      await post(base, valid);

      const response = await fetch(`${base}/api/books/1`, {
        headers: { cookie: AUTH_COOKIE },
      });

      const body = await json<BookDetail>(response);
      assert.equal(body.viewerLikeId, VIEWER_LIKE_ID);
    }
  );
});

test('GET by id returns 404 for a missing record', async () => {
  await withAuthenticatedApp(
    { bookRepository: createFakeRepository() },
    async (base) => {
      assert.equal((await fetch(`${base}/api/books/999`)).status, 404);
    }
  );
});

test('GET by id rejects a non-numeric id with 400', async () => {
  await withAuthenticatedApp(
    { bookRepository: createFakeRepository() },
    async (base) => {
      assert.equal((await fetch(`${base}/api/books/abc`)).status, 400);
    }
  );
});

test('PATCH replaces tags but leaves them alone when omitted', async () => {
  await withAuthenticatedApp(
    { bookRepository: createFakeRepository() },
    async (base) => {
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
    }
  );
});

// The interesting case: `.partial()` does not undo `.default()`, so a PATCH
// schema derived from the create schema would parse this body as
// `seriesId: null` and silently unlink the book.
test('PATCH omitting seriesId leaves the book in its series', async () => {
  await withAuthenticatedApp(
    { bookRepository: createFakeRepository() },
    async (base) => {
      const { id } = await json<PublicBook>(await post(base, valid));

      const patched = await json<PublicBook>(
        await patch(base, id, { description: 'Rewritten' })
      );

      assert.equal(patched.seriesId, KNOWN_SERIES_ID);
    }
  );
});

test('PATCH with an explicit null seriesId unlinks the book', async () => {
  await withAuthenticatedApp(
    { bookRepository: createFakeRepository() },
    async (base) => {
      const { id } = await json<PublicBook>(await post(base, valid));

      const patched = await json<PublicBook>(
        await patch(base, id, { seriesId: null })
      );

      assert.equal(patched.seriesId, null);
    }
  );
});

test('PATCH cannot re-parent a book to another user', async () => {
  await withAuthenticatedApp(
    { bookRepository: createFakeRepository() },
    async (base) => {
      const { id } = await json<PublicBook>(await post(base, valid));

      // userId is not in updateBookSchema, so a body carrying only it has no
      // recognised keys and fails the "at least one field" refinement.
      const response = await patch(base, id, { userId: 2 });

      assert.equal(response.status, 400);
    }
  );
});

test('PATCH with an empty body is a 400', async () => {
  await withAuthenticatedApp(
    { bookRepository: createFakeRepository() },
    async (base) => {
      const { id } = await json<PublicBook>(await post(base, valid));

      assert.equal((await patch(base, id, {})).status, 400);
    }
  );
});

test('PATCH on a missing record is a 404', async () => {
  await withAuthenticatedApp(
    { bookRepository: createFakeRepository() },
    async (base) => {
      assert.equal((await patch(base, 999, { tags: [] })).status, 404);
    }
  );
});

test('DELETE removes the book, then reports 404 on a second attempt', async () => {
  await withAuthenticatedApp(
    { bookRepository: createFakeRepository() },
    async (base) => {
      const { id } = await json<PublicBook>(await post(base, valid));

      const first = await remove(base, id);
      const second = await remove(base, id);

      assert.equal(first.status, 204);
      assert.equal(second.status, 404);
    }
  );
});

test('POST without a session is 401', async () => {
  await withApp({ bookRepository: createFakeRepository() }, async (base) => {
    assert.equal((await post(base, valid, null)).status, 401);
  });
});

test('PATCH without a session is 401', async () => {
  await withApp({ bookRepository: createFakeRepository() }, async (base) => {
    assert.equal((await patch(base, 1, { tags: [] }, null)).status, 401);
  });
});

test('DELETE without a session is 401', async () => {
  await withApp({ bookRepository: createFakeRepository() }, async (base) => {
    assert.equal((await remove(base, 1, null)).status, 401);
  });
});

test('GET stays public', async () => {
  await withApp({ bookRepository: createFakeRepository() }, async (base) => {
    assert.equal((await fetch(`${base}/api/books`)).status, 200);
  });
});

// --- The permission matrix: who may create, edit and delete a book. ---

test('an author creates a book', async () => {
  await withAuthenticatedApp(
    { bookRepository: createFakeRepository() },
    async (base) => {
      const response = await post(base, valid, ROLE_COOKIES.author);
      assert.equal(response.status, 201);
    }
  );
});

test('a plain user may not create a book', async () => {
  await withAuthenticatedApp(
    { bookRepository: createFakeRepository() },
    async (base) => {
      const response = await post(base, valid, ROLE_COOKIES.user);
      assert.equal(response.status, 403);
    }
  );
});

test('an admin may not create a book either', async () => {
  // Admins moderate; they do not author. The one deliberate break in the
  // accumulation of roles.
  await withAuthenticatedApp(
    { bookRepository: createFakeRepository() },
    async (base) => {
      const response = await post(base, valid, ROLE_COOKIES.admin);
      assert.equal(response.status, 403);
    }
  );
});

test('an author may not edit another author book', async () => {
  await withAuthenticatedApp(
    { bookRepository: createFakeRepository() },
    async (base) => {
      const created = await json<PublicBook>(
        await post(base, valid, ROLE_COOKIES.author)
      );

      const response = await patch(
        base,
        created.id,
        { description: 'Hijacked' },
        ROLE_COOKIES.otherAuthor
      );
      assert.equal(response.status, 403);
    }
  );
});

test('an author may not delete another author book', async () => {
  await withAuthenticatedApp(
    { bookRepository: createFakeRepository() },
    async (base) => {
      const created = await json<PublicBook>(
        await post(base, valid, ROLE_COOKIES.author)
      );

      const response = await remove(base, created.id, ROLE_COOKIES.otherAuthor);
      assert.equal(response.status, 403);

      // The row must survive the refused attempt, not just the status code.
      const stillThere = await fetch(`${base}/api/books/${created.id}`);
      assert.equal(stillThere.status, 200);
    }
  );
});

test('an admin may edit and delete any book', async () => {
  await withAuthenticatedApp(
    { bookRepository: createFakeRepository() },
    async (base) => {
      const created = await json<PublicBook>(
        await post(base, valid, ROLE_COOKIES.author)
      );

      assert.equal(
        (
          await patch(
            base,
            created.id,
            { description: 'Fixed' },
            ROLE_COOKIES.admin
          )
        ).status,
        200
      );
      assert.equal(
        (await remove(base, created.id, ROLE_COOKIES.admin)).status,
        204
      );
    }
  );
});

// --- Filing a book under a series: the series has to be the caller's too. ---

test('an author may not create a book in another author series', async () => {
  await withAuthenticatedApp(
    { bookRepository: createFakeRepository() },
    async (base) => {
      const response = await post(
        base,
        { ...valid, seriesId: OTHER_AUTHOR_SERIES_ID },
        ROLE_COOKIES.author
      );
      assert.equal(response.status, 403);

      // Refused before the write, not written and then reported: the other
      // author's series must not start listing the book.
      const listed = await json<{ total: number }>(
        await fetch(`${base}/api/books?seriesId=${OTHER_AUTHOR_SERIES_ID}`)
      );
      assert.equal(listed.total, 0);
    }
  );
});

test('an author may not move their own book into another author series', async () => {
  await withAuthenticatedApp(
    { bookRepository: createFakeRepository() },
    async (base) => {
      const created = await json<PublicBook>(
        await post(base, valid, ROLE_COOKIES.author)
      );

      const response = await patch(
        base,
        created.id,
        { seriesId: OTHER_AUTHOR_SERIES_ID },
        ROLE_COOKIES.author
      );
      assert.equal(response.status, 403);

      const stored = await json<PublicBook>(
        await fetch(`${base}/api/books/${created.id}`)
      );
      assert.equal(stored.seriesId, KNOWN_SERIES_ID);
    }
  );
});

test('an author may create a book in their own series', async () => {
  await withAuthenticatedApp(
    { bookRepository: createFakeRepository() },
    async (base) => {
      const response = await post(
        base,
        { ...valid, seriesId: KNOWN_SERIES_ID },
        ROLE_COOKIES.author
      );

      assert.equal(response.status, 201);
      assert.equal(
        (await json<PublicBook>(response)).seriesId,
        KNOWN_SERIES_ID
      );
    }
  );
});

test('an author may unlink their book with seriesId: null', async () => {
  // Leaving a series touches no series, so there is nothing to check.
  await withAuthenticatedApp(
    { bookRepository: createFakeRepository() },
    async (base) => {
      const created = await json<PublicBook>(
        await post(base, valid, ROLE_COOKIES.author)
      );

      const response = await patch(
        base,
        created.id,
        { seriesId: null },
        ROLE_COOKIES.author
      );

      assert.equal(response.status, 200);
      assert.equal((await json<PublicBook>(response)).seriesId, null);
    }
  );
});

test('an admin may file any book under any series', async () => {
  // `any` skips the series check just as it skips the book's.
  await withAuthenticatedApp(
    { bookRepository: createFakeRepository() },
    async (base) => {
      const created = await json<PublicBook>(
        await post(base, valid, ROLE_COOKIES.author)
      );

      const response = await patch(
        base,
        created.id,
        { seriesId: OTHER_AUTHOR_SERIES_ID },
        ROLE_COOKIES.admin
      );

      assert.equal(response.status, 200);
      assert.equal(
        (await json<PublicBook>(response)).seriesId,
        OTHER_AUTHOR_SERIES_ID
      );
    }
  );
});

// --- Co-authors: every one of them may touch the book (ADR-0005). ---

const addCoAuthor = (
  base: string,
  bookId: number,
  userId: number,
  cookie: string | null = ROLE_COOKIES.author
) =>
  fetch(`${base}/api/books/${bookId}/co-authors`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(cookie ? { cookie } : {}),
    },
    body: JSON.stringify({ userId }),
  });

const removeCoAuthor = (
  base: string,
  bookId: number,
  userId: number,
  cookie: string | null = ROLE_COOKIES.author
) =>
  fetch(`${base}/api/books/${bookId}/co-authors/${userId}`, {
    method: 'DELETE',
    headers: { ...(cookie ? { cookie } : {}) },
  });

test('a co-author credited by the author may edit the book', async () => {
  await withAuthenticatedApp(
    { bookRepository: createFakeRepository() },
    async (base) => {
      const { id } = await json<PublicBook>(await post(base, valid));

      const added = await addCoAuthor(base, id, USER_IDS.otherAuthor);
      assert.equal(added.status, 200);
      assert.deepEqual(
        (await json<PublicBook>(added)).authors.map((author) => author.id),
        [KNOWN_USER_ID, USER_IDS.otherAuthor]
      );

      const response = await patch(
        base,
        id,
        { description: 'Co-written' },
        ROLE_COOKIES.otherAuthor
      );
      assert.equal(response.status, 200);
    }
  );
});

test('a co-author may remove another co-author', async () => {
  await withAuthenticatedApp(
    { bookRepository: createFakeRepository() },
    async (base) => {
      const { id } = await json<PublicBook>(await post(base, valid));
      await addCoAuthor(base, id, USER_IDS.otherAuthor);

      const response = await removeCoAuthor(
        base,
        id,
        KNOWN_USER_ID,
        ROLE_COOKIES.otherAuthor
      );

      assert.equal(response.status, 200);
      assert.deepEqual(
        (await json<PublicBook>(response)).authors.map((author) => author.id),
        [USER_IDS.otherAuthor]
      );
    }
  );
});

test('a co-author who is no longer an author may still leave', async () => {
  // The `user` persona stands in for an author who switched Role: the matrix
  // gives it `none` on books, and leaving must not depend on that grant.
  await withAuthenticatedApp(
    { bookRepository: createFakeRepository() },
    async (base) => {
      const { id } = await json<PublicBook>(await post(base, valid));
      await addCoAuthor(base, id, USER_IDS.user);

      const response = await removeCoAuthor(
        base,
        id,
        USER_IDS.user,
        ROLE_COOKIES.user
      );

      assert.equal(response.status, 200);
      assert.deepEqual(
        (await json<PublicBook>(response)).authors.map((author) => author.id),
        [KNOWN_USER_ID]
      );
    }
  );
});

test('a moderator may not change who is credited on a book', async () => {
  await withAuthenticatedApp(
    { bookRepository: createFakeRepository() },
    async (base) => {
      const { id } = await json<PublicBook>(await post(base, valid));
      await addCoAuthor(base, id, USER_IDS.otherAuthor);

      for (const moderator of [ROLE_COOKIES.admin, ROLE_COOKIES.superadmin]) {
        assert.equal(
          (await addCoAuthor(base, id, USER_IDS.user, moderator)).status,
          403
        );
        assert.equal(
          (await removeCoAuthor(base, id, USER_IDS.otherAuthor, moderator))
            .status,
          403
        );
      }

      const stored = await json<PublicBook>(
        await fetch(`${base}/api/books/${id}`)
      );
      assert.deepEqual(
        stored.authors.map((author) => author.id),
        [KNOWN_USER_ID, USER_IDS.otherAuthor]
      );
    }
  );
});

test('an author who is not credited may not change the co-authors', async () => {
  await withAuthenticatedApp(
    { bookRepository: createFakeRepository() },
    async (base) => {
      const { id } = await json<PublicBook>(await post(base, valid));

      assert.equal(
        (
          await addCoAuthor(
            base,
            id,
            USER_IDS.otherAuthor,
            ROLE_COOKIES.otherAuthor
          )
        ).status,
        403
      );
      assert.equal(
        (
          await removeCoAuthor(
            base,
            id,
            KNOWN_USER_ID,
            ROLE_COOKIES.otherAuthor
          )
        ).status,
        403
      );
    }
  );
});

test('a co-author who is no longer an author may not remove anyone else', async () => {
  await withAuthenticatedApp(
    { bookRepository: createFakeRepository() },
    async (base) => {
      const { id } = await json<PublicBook>(await post(base, valid));
      await addCoAuthor(base, id, USER_IDS.user);

      const response = await removeCoAuthor(
        base,
        id,
        KNOWN_USER_ID,
        ROLE_COOKIES.user
      );
      assert.equal(response.status, 403);
    }
  );
});

test('changing co-authors without a session is 401', async () => {
  await withApp({ bookRepository: createFakeRepository() }, async (base) => {
    assert.equal((await addCoAuthor(base, 1, 2, null)).status, 401);
    assert.equal((await removeCoAuthor(base, 1, 2, null)).status, 401);
  });
});

test('crediting a co-author on a missing book is a 404', async () => {
  await withAuthenticatedApp(
    { bookRepository: createFakeRepository() },
    async (base) => {
      assert.equal(
        (await addCoAuthor(base, 999, USER_IDS.otherAuthor)).status,
        404
      );
      assert.equal(
        (await removeCoAuthor(base, 999, KNOWN_USER_ID, ROLE_COOKIES.author))
          .status,
        404
      );
    }
  );
});

test('any co-author of a series may file a book under it, not only its first', async () => {
  await withAuthenticatedApp(
    { bookRepository: createFakeRepository() },
    async (base) => {
      const response = await post(
        base,
        { ...valid, seriesId: SHARED_SERIES_ID },
        ROLE_COOKIES.author
      );

      assert.equal(response.status, 201);
      assert.equal(
        (await json<PublicBook>(response)).seriesId,
        SHARED_SERIES_ID
      );
    }
  );
});

// --- Book status: every book starts as a draft (CONTEXT.md). ---

test('POST ignores a status in the body — every book starts as a draft', async () => {
  await withAuthenticatedApp(
    { bookRepository: createFakeRepository() },
    async (base) => {
      const response = await post(base, { ...valid, status: 'complete' });

      assert.equal(response.status, 201);
      assert.equal((await json<PublicBook>(response)).status, 'draft');
    }
  );
});

test('PATCH moves a book to any status and rejects an unknown one', async () => {
  await withAuthenticatedApp(
    { bookRepository: createFakeRepository() },
    async (base) => {
      const { id } = await json<PublicBook>(await post(base, valid));

      for (const status of ['complete', 'in_progress', 'draft']) {
        const response = await patch(base, id, { status });
        assert.equal(response.status, 200);
        assert.equal((await json<PublicBook>(response)).status, status);
      }
      assert.equal(
        (await patch(base, id, { status: 'published' })).status,
        400
      );
    }
  );
});

test('reads are made as the signed-in caller, or as a guest', async () => {
  const viewers: Viewer[] = [];
  await withAuthenticatedApp(
    { bookRepository: createFakeRepository(viewers) },
    async (base) => {
      await post(base, valid);

      await fetch(`${base}/api/books/1`);
      await fetch(`${base}/api/books?userId=${KNOWN_USER_ID}`, {
        headers: { cookie: ROLE_COOKIES.author },
      });
      await fetch(`${base}/api/books/1`, {
        headers: { cookie: ROLE_COOKIES.admin },
      });

      assert.deepEqual(viewers, [
        null,
        { id: KNOWN_USER_ID, role: 'author' },
        { id: USER_IDS.admin, role: 'admin' },
      ]);
    }
  );
});

// --- The series editor's book list and its Series order (CONTEXT.md). ---

const seriesBooks = (
  base: string,
  seriesId: number,
  cookie: string | null = ROLE_COOKIES.author
) =>
  fetch(`${base}/api/series/${seriesId}/books`, {
    ...(cookie ? { headers: { cookie } } : {}),
  });

const putSeriesOrder = (
  base: string,
  seriesId: number,
  body: unknown,
  cookie: string | null = ROLE_COOKIES.author
) =>
  fetch(`${base}/api/series/${seriesId}/book-order`, {
    method: 'PUT',
    headers: {
      'content-type': 'application/json',
      ...(cookie ? { cookie } : {}),
    },
    body: JSON.stringify(body),
  });

test('the series editor lists every book filed in the series, drafts included, as summaries', async () => {
  await withAuthenticatedApp(
    { bookRepository: createFakeRepository() },
    async (base) => {
      const created = await json<PublicBook>(await post(base, valid));
      assert.equal(created.status, 'draft');

      const response = await seriesBooks(base, KNOWN_SERIES_ID);
      const body = await json<{ items: unknown[] }>(response);

      assert.equal(response.status, 200);
      assert.deepEqual(body.items, [
        {
          id: created.id,
          title: created.title,
          status: 'draft',
          authors: [AUTHOR],
        },
      ]);
    }
  );
});

test('the series editor list takes a co-author of the series, or a moderator', async () => {
  await withAuthenticatedApp(
    { bookRepository: createFakeRepository() },
    async (base) => {
      assert.equal(
        (await seriesBooks(base, KNOWN_SERIES_ID, null)).status,
        401
      );
      assert.equal(
        (await seriesBooks(base, KNOWN_SERIES_ID, ROLE_COOKIES.user)).status,
        403
      );
      assert.equal(
        (await seriesBooks(base, KNOWN_SERIES_ID, ROLE_COOKIES.otherAuthor))
          .status,
        403
      );
      assert.equal(
        (await seriesBooks(base, SHARED_SERIES_ID, ROLE_COOKIES.otherAuthor))
          .status,
        200
      );
      assert.equal(
        (await seriesBooks(base, OTHER_AUTHOR_SERIES_ID, ROLE_COOKIES.admin))
          .status,
        200
      );
      assert.equal((await seriesBooks(base, 999)).status, 404);
      assert.equal(
        (await seriesBooks(base, 999, ROLE_COOKIES.admin)).status,
        404
      );
    }
  );
});

test('PUT book-order hands the repository the new Series order and answers 204', async () => {
  const reorders: unknown[] = [];
  await withAuthenticatedApp(
    { bookRepository: createFakeRepository([], reorders) },
    async (base) => {
      const response = await putSeriesOrder(base, KNOWN_SERIES_ID, {
        bookIds: [3, 1, 2],
      });

      assert.equal(response.status, 204);
      assert.deepEqual(reorders, [
        { seriesId: KNOWN_SERIES_ID, bookIds: [3, 1, 2] },
      ]);
    }
  );
});

test('PUT book-order refuses a bad list with 400 and a stranger with 403', async () => {
  await withAuthenticatedApp(
    { bookRepository: createFakeRepository() },
    async (base) => {
      for (const bookIds of [[], [1, 1]]) {
        assert.equal(
          (await putSeriesOrder(base, KNOWN_SERIES_ID, { bookIds })).status,
          400
        );
      }
      const body = { bookIds: [1, 2] };
      assert.equal(
        (await putSeriesOrder(base, KNOWN_SERIES_ID, body, null)).status,
        401
      );
      assert.equal(
        (
          await putSeriesOrder(
            base,
            KNOWN_SERIES_ID,
            body,
            ROLE_COOKIES.otherAuthor
          )
        ).status,
        403
      );
      assert.equal(
        (
          await putSeriesOrder(
            base,
            OTHER_AUTHOR_SERIES_ID,
            body,
            ROLE_COOKIES.admin
          )
        ).status,
        204
      );
      assert.equal((await putSeriesOrder(base, 999, body)).status, 404);
    }
  );
});

test('a series reorder conflict from the repository reaches the caller as a 409', async () => {
  const repository = createFakeRepository();
  await withAuthenticatedApp(
    {
      bookRepository: {
        ...repository,
        async reorderInSeries() {
          throw new StateConflictError(
            'The books of this series changed since you loaded them'
          );
        },
      },
    },
    async (base) => {
      const response = await putSeriesOrder(base, KNOWN_SERIES_ID, {
        bookIds: [1, 2],
      });

      assert.equal(response.status, 409);
    }
  );
});
