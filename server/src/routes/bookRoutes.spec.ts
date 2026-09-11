import test from 'node:test';
import assert from 'node:assert/strict';
import { NotFoundError } from '../types/errors.ts';
import type {
  BookListResult,
  BookRepository,
} from '../repositories/bookRepository.ts';
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

// Stands in for the series table: which series exist, and who owns each.
const SERIES_OWNERS = new Map<number, number>([
  [KNOWN_SERIES_ID, KNOWN_USER_ID],
  [OTHER_AUTHOR_SERIES_ID, USER_IDS.otherAuthor],
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
      if (input.seriesId !== null && !SERIES_OWNERS.has(input.seriesId)) {
        throw new NotFoundError('Series', input.seriesId);
      }

      const now = new Date();
      const book: PublicBook = {
        id: nextId,
        userId: input.userId,
        seriesId: input.seriesId,
        title: input.title,
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

    async findDetailById(id, viewerId) {
      const book = rows.get(id);
      if (!book) return null;

      return {
        ...book,
        author: AUTHOR,
        series: { id: KNOWN_SERIES_ID, title: 'The Cycle' },
        likeCount: 4,
        // Stands in for the real repository's viewer lookup: only a signed-in
        // caller can have a like of their own to report.
        viewerLikeId: viewerId === null ? null : VIEWER_LIKE_ID,
      };
    },

    async update(id, input) {
      const current = rows.get(id);
      if (!current) return null;
      if (
        input.seriesId !== null &&
        input.seriesId !== undefined &&
        !SERIES_OWNERS.has(input.seriesId)
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

    async findOwnerId(id) {
      return rows.get(id)?.userId ?? null;
    },

    async findSeriesOwnerId(seriesId) {
      return SERIES_OWNERS.get(seriesId) ?? null;
    },
  };
}

// No userId: the owner comes from the session, never the body.
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

test('POST creates a book and echoes its tags and series', async () => {
  await withAuthenticatedApp(
    { bookRepository: createFakeRepository() },
    async (base) => {
      const response = await post(base, valid);
      const body = await json<PublicBook>(response);

      assert.equal(response.status, 201);
      assert.equal(body.userId, KNOWN_USER_ID);
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

test('GET by id embeds the author and series, and never the email', async () => {
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
      assert.equal(body.author.login, 'Author');
      assert.equal('email' in body.author, false);
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
