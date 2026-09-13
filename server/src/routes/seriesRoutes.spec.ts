import test from 'node:test';
import assert from 'node:assert/strict';
import { NotFoundError } from '../types/errors.ts';
import type {
  SeriesListResult,
  SeriesRepository,
} from '../repositories/seriesRepository.ts';
import type { PublicSeries } from '../types/series.ts';
import type { AuthorSummary } from '../types/user.ts';
import {
  json,
  ROLE_COOKIES,
  USER_IDS,
  withApp,
  withAuthenticatedApp,
} from './routeTestKit.testkit.ts';

// Every series in this suite is created by the `author` persona by default —
// only `author` (and `admin`, on update/delete) has anything but `none` on
// series in the matrix — so the "known valid user" the fake repository
// accepts is that persona's id, not an arbitrary constant.
const KNOWN_USER_ID = USER_IDS.author;
const UNOWNED_USER_ID = 999997;
// A book the fake files under series 1 on creation, so the unlink route has
// something to take out.
const FILED_BOOK_ID = 40;

// Every persona a fake credit can name, so a response's `authors` carries real
// summaries rather than ids.
const SUMMARIES = new Map<number, AuthorSummary>(
  [KNOWN_USER_ID, USER_IDS.otherAuthor, USER_IDS.user].map((id) => [
    id,
    { id, login: `persona-${id}`, firstName: 'First', lastName: `Last${id}` },
  ])
);

function createFakeRepository(): SeriesRepository {
  const rows = new Map<number, PublicSeries>();
  // seriesId -> co-author ids, in credit order. The rules on credits (the
  // author role, duplicates, the last co-author) belong to the real repository
  // and are covered against MySQL; this fake only keeps the list.
  const credits = new Map<number, number[]>();
  // bookId -> seriesId, for the books filed under a series.
  const filed = new Map<number, number>();
  let nextId = 1;

  const withCredits = (series: PublicSeries): PublicSeries => ({
    ...series,
    authors: (credits.get(series.id) ?? []).flatMap(
      (id) => SUMMARIES.get(id) ?? []
    ),
  });

  return {
    async create(input) {
      // Stands in for the foreign key: the real repository maps MySQL's
      // rejection to this same NotFoundError.
      if (input.userId !== KNOWN_USER_ID) {
        throw new NotFoundError('User', input.userId);
      }

      const now = new Date();
      const series: PublicSeries = {
        id: nextId,
        authors: [],
        title: input.title,
        description: input.description,
        tags: input.tags,
        createdAt: now,
        updatedAt: now,
      };
      nextId += 1;
      rows.set(series.id, series);
      credits.set(series.id, [input.userId]);
      if (series.id === 1) filed.set(FILED_BOOK_ID, series.id);
      return withCredits(series);
    },

    async list(query): Promise<SeriesListResult> {
      const all = [...rows.values()].filter(
        (row) =>
          (query.userId === undefined ||
            (credits.get(row.id) ?? []).includes(query.userId)) &&
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
      const series = rows.get(id);
      return series ? withCredits(series) : null;
    },

    async update(id, input) {
      const current = rows.get(id);
      if (!current) return null;
      const updated: PublicSeries = {
        ...current,
        description: input.description ?? current.description,
        tags: input.tags ?? current.tags,
        updatedAt: new Date(),
      };
      rows.set(id, updated);
      return withCredits(updated);
    },

    async remove(id) {
      credits.delete(id);
      return rows.delete(id);
    },

    async removeBook(seriesId, bookId) {
      if (!rows.has(seriesId)) return false;
      if (filed.get(bookId) !== seriesId) {
        throw new NotFoundError('Book', bookId);
      }
      filed.delete(bookId);
      return true;
    },

    async addCoAuthor(seriesId, userId) {
      const series = rows.get(seriesId);
      if (!series) return null;
      credits.set(seriesId, [...(credits.get(seriesId) ?? []), userId]);
      return withCredits(series);
    },

    async removeCoAuthor(seriesId, userId) {
      const series = rows.get(seriesId);
      if (!series) return null;
      credits.set(
        seriesId,
        (credits.get(seriesId) ?? []).filter((id) => id !== userId)
      );
      return withCredits(series);
    },

    async findCoAuthorIds(id) {
      return credits.get(id) ?? null;
    },
  };
}

// No userId: the first Co-author comes from the session, never the body.
const valid = {
  title: 'A Space Opera',
  description: 'A space opera in three parts',
  tags: ['sci-fi', 'epic'],
};

// Defaults to the author persona: create and update both need `own` or `any`
// scope on series, and `user` has `none` on all three, so AUTH_COOKIE (the
// `user` persona) is not a usable default for a write in this file.
const post = (
  base: string,
  body: unknown,
  cookie: string | null = ROLE_COOKIES.author
) =>
  fetch(`${base}/api/series`, {
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
  fetch(`${base}/api/series/${id}`, {
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
  fetch(`${base}/api/series/${id}`, {
    method: 'DELETE',
    headers: {
      ...(cookie ? { cookie } : {}),
    },
  });

test('POST creates a series credited to the caller and echoes its tags', async () => {
  await withAuthenticatedApp(
    { seriesRepository: createFakeRepository() },
    async (base) => {
      const response = await post(base, valid);
      const body = await json<PublicSeries>(response);

      assert.equal(response.status, 201);
      assert.deepEqual(
        body.authors.map((author) => author.id),
        [KNOWN_USER_ID]
      );
      assert.deepEqual(body.tags, ['sci-fi', 'epic']);
    }
  );
});

test('POST defaults tags to an empty array when omitted', async () => {
  await withAuthenticatedApp(
    { seriesRepository: createFakeRepository() },
    async (base) => {
      const response = await post(base, {
        title: 'No Tags Yet',
        description: 'No tags yet',
      });

      assert.equal(response.status, 201);
      assert.deepEqual((await json<PublicSeries>(response)).tags, []);
    }
  );
});

test('POST collapses duplicate tags before storing them', async () => {
  await withAuthenticatedApp(
    { seriesRepository: createFakeRepository() },
    async (base) => {
      const response = await post(base, {
        ...valid,
        tags: ['epic', 'epic', 'sci-fi'],
      });

      assert.deepEqual((await json<PublicSeries>(response)).tags, [
        'epic',
        'sci-fi',
      ]);
    }
  );
});

test('POST rejects a missing description with 400', async () => {
  await withAuthenticatedApp(
    { seriesRepository: createFakeRepository() },
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

// There is no longer a route-level way to reach an "unknown user" 404: userId
// is not client-controlled, and authStubs only ever resolves known personas.
// The repository-level mapping from a rejected FK to NotFoundError is still
// covered directly in seriesRepository.spec.ts.

test('GET list returns items with the paging envelope', async () => {
  await withAuthenticatedApp(
    { seriesRepository: createFakeRepository() },
    async (base) => {
      await post(base, valid);
      const response = await fetch(`${base}/api/series`);
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

test('GET list filters by tag and by owner', async () => {
  await withAuthenticatedApp(
    { seriesRepository: createFakeRepository() },
    async (base) => {
      await post(base, valid);
      await post(base, {
        ...valid,
        description: 'Standalone',
        tags: ['drama'],
      });

      const byTag = await json<{ total: number }>(
        await fetch(`${base}/api/series?tag=drama`)
      );
      const byUser = await json<{ total: number }>(
        await fetch(`${base}/api/series?userId=${KNOWN_USER_ID}`)
      );
      const byOther = await json<{ total: number }>(
        await fetch(`${base}/api/series?userId=${UNOWNED_USER_ID}`)
      );

      assert.equal(byTag.total, 1);
      assert.equal(byUser.total, 2);
      assert.equal(byOther.total, 0);
    }
  );
});

test('GET by id returns 404 for a missing record', async () => {
  await withAuthenticatedApp(
    { seriesRepository: createFakeRepository() },
    async (base) => {
      assert.equal((await fetch(`${base}/api/series/999`)).status, 404);
    }
  );
});

test('GET by id rejects a non-numeric id with 400', async () => {
  await withAuthenticatedApp(
    { seriesRepository: createFakeRepository() },
    async (base) => {
      assert.equal((await fetch(`${base}/api/series/abc`)).status, 400);
    }
  );
});

test('PATCH replaces tags but leaves them alone when omitted', async () => {
  await withAuthenticatedApp(
    { seriesRepository: createFakeRepository() },
    async (base) => {
      const created = await json<PublicSeries>(await post(base, valid));

      const retagged = await json<PublicSeries>(
        await patch(base, created.id, { tags: ['drama'] })
      );
      assert.deepEqual(retagged.tags, ['drama']);

      const renamed = await json<PublicSeries>(
        await patch(base, created.id, { description: 'Rewritten' })
      );
      assert.equal(renamed.description, 'Rewritten');
      assert.deepEqual(renamed.tags, ['drama']);
    }
  );
});

test('PATCH ignores userId rather than re-crediting the series', async () => {
  await withAuthenticatedApp(
    { seriesRepository: createFakeRepository() },
    async (base) => {
      const created = await json<PublicSeries>(await post(base, valid));
      const response = await patch(base, created.id, {
        userId: UNOWNED_USER_ID,
        description: 'Rewritten',
      });

      assert.equal(response.status, 200);
      assert.deepEqual(
        (await json<PublicSeries>(response)).authors.map((author) => author.id),
        [KNOWN_USER_ID]
      );
    }
  );
});

test('PATCH with an empty body is rejected with 400', async () => {
  await withAuthenticatedApp(
    { seriesRepository: createFakeRepository() },
    async (base) => {
      const created = await json<PublicSeries>(await post(base, valid));

      assert.equal((await patch(base, created.id, {})).status, 400);
    }
  );
});

test('PATCH on a missing record is a 404', async () => {
  await withAuthenticatedApp(
    { seriesRepository: createFakeRepository() },
    async (base) => {
      assert.equal((await patch(base, 999, { tags: [] })).status, 404);
    }
  );
});

test('DELETE removes the series, then reports 404 on a second attempt', async () => {
  await withAuthenticatedApp(
    { seriesRepository: createFakeRepository() },
    async (base) => {
      const created = await json<PublicSeries>(await post(base, valid));

      const first = await remove(base, created.id);
      const second = await remove(base, created.id);

      assert.equal(first.status, 204);
      assert.equal(second.status, 404);
    }
  );
});

test('POST without a session is 401', async () => {
  await withApp({ seriesRepository: createFakeRepository() }, async (base) => {
    assert.equal((await post(base, valid, null)).status, 401);
  });
});

test('PATCH without a session is 401', async () => {
  await withApp({ seriesRepository: createFakeRepository() }, async (base) => {
    assert.equal((await patch(base, 1, { tags: [] }, null)).status, 401);
  });
});

test('DELETE without a session is 401', async () => {
  await withApp({ seriesRepository: createFakeRepository() }, async (base) => {
    assert.equal((await remove(base, 1, null)).status, 401);
  });
});

test('GET stays public', async () => {
  await withApp({ seriesRepository: createFakeRepository() }, async (base) => {
    assert.equal((await fetch(`${base}/api/series`)).status, 200);
  });
});

// --- The permission matrix: who may create, edit and delete a series. ---

test('an author creates a series and a plain user may not', async () => {
  await withAuthenticatedApp(
    { seriesRepository: createFakeRepository() },
    async (base) => {
      assert.equal((await post(base, valid, ROLE_COOKIES.author)).status, 201);
      assert.equal((await post(base, valid, ROLE_COOKIES.user)).status, 403);
    }
  );
});

test('an admin may not create a series but may delete any', async () => {
  await withAuthenticatedApp(
    { seriesRepository: createFakeRepository() },
    async (base) => {
      assert.equal((await post(base, valid, ROLE_COOKIES.admin)).status, 403);

      const created = await json<PublicSeries>(
        await post(base, valid, ROLE_COOKIES.author)
      );
      assert.equal(
        (await remove(base, created.id, ROLE_COOKIES.admin)).status,
        204
      );
    }
  );
});

test('an author may not edit another author series', async () => {
  await withAuthenticatedApp(
    { seriesRepository: createFakeRepository() },
    async (base) => {
      const created = await json<PublicSeries>(
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

test('an author may not delete another author series', async () => {
  await withAuthenticatedApp(
    { seriesRepository: createFakeRepository() },
    async (base) => {
      const created = await json<PublicSeries>(
        await post(base, valid, ROLE_COOKIES.author)
      );

      const response = await remove(base, created.id, ROLE_COOKIES.otherAuthor);
      assert.equal(response.status, 403);

      // The row must survive the refused attempt, not just the status code.
      const stillThere = await fetch(`${base}/api/series/${created.id}`);
      assert.equal(stillThere.status, 200);
    }
  );
});

test('an admin may edit another author series', async () => {
  await withAuthenticatedApp(
    { seriesRepository: createFakeRepository() },
    async (base) => {
      const created = await json<PublicSeries>(
        await post(base, valid, ROLE_COOKIES.author)
      );

      const response = await patch(
        base,
        created.id,
        { description: 'Moderated' },
        ROLE_COOKIES.admin
      );
      assert.equal(response.status, 200);
      assert.equal(
        (await json<PublicSeries>(response)).description,
        'Moderated'
      );
    }
  );
});

test('an anonymous create is 401 and GET stays public', async () => {
  await withApp({ seriesRepository: createFakeRepository() }, async (base) => {
    assert.equal((await post(base, valid, null)).status, 401);
    assert.equal((await fetch(`${base}/api/series`)).status, 200);
  });
});

// --- Co-authors: every one of them may touch the series (ADR-0005). ---

const addCoAuthor = (
  base: string,
  seriesId: number,
  userId: number,
  cookie: string | null = ROLE_COOKIES.author
) =>
  fetch(`${base}/api/series/${seriesId}/co-authors`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(cookie ? { cookie } : {}),
    },
    body: JSON.stringify({ userId }),
  });

const removeCoAuthor = (
  base: string,
  seriesId: number,
  userId: number,
  cookie: string | null = ROLE_COOKIES.author
) =>
  fetch(`${base}/api/series/${seriesId}/co-authors/${userId}`, {
    method: 'DELETE',
    headers: { ...(cookie ? { cookie } : {}) },
  });

const removeBook = (
  base: string,
  seriesId: number,
  bookId: number,
  cookie: string | null = ROLE_COOKIES.author
) =>
  fetch(`${base}/api/series/${seriesId}/books/${bookId}`, {
    method: 'DELETE',
    headers: { ...(cookie ? { cookie } : {}) },
  });

test('a co-author credited by the author may edit the series', async () => {
  await withAuthenticatedApp(
    { seriesRepository: createFakeRepository() },
    async (base) => {
      const { id } = await json<PublicSeries>(await post(base, valid));

      const added = await addCoAuthor(base, id, USER_IDS.otherAuthor);
      assert.equal(added.status, 200);
      assert.deepEqual(
        (await json<PublicSeries>(added)).authors.map((author) => author.id),
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

test('a co-author may remove another co-author of the series', async () => {
  await withAuthenticatedApp(
    { seriesRepository: createFakeRepository() },
    async (base) => {
      const { id } = await json<PublicSeries>(await post(base, valid));
      await addCoAuthor(base, id, USER_IDS.otherAuthor);

      const response = await removeCoAuthor(
        base,
        id,
        KNOWN_USER_ID,
        ROLE_COOKIES.otherAuthor
      );

      assert.equal(response.status, 200);
      assert.deepEqual(
        (await json<PublicSeries>(response)).authors.map((a) => a.id),
        [USER_IDS.otherAuthor]
      );
    }
  );
});

test('a series co-author who is no longer an author may still leave', async () => {
  await withAuthenticatedApp(
    { seriesRepository: createFakeRepository() },
    async (base) => {
      const { id } = await json<PublicSeries>(await post(base, valid));
      await addCoAuthor(base, id, USER_IDS.user);

      const response = await removeCoAuthor(
        base,
        id,
        USER_IDS.user,
        ROLE_COOKIES.user
      );
      assert.equal(response.status, 200);

      await addCoAuthor(base, id, USER_IDS.user);
      assert.equal(
        (await removeCoAuthor(base, id, KNOWN_USER_ID, ROLE_COOKIES.user))
          .status,
        403
      );
    }
  );
});

test('a moderator or a stranger may not change who is credited on a series', async () => {
  await withAuthenticatedApp(
    { seriesRepository: createFakeRepository() },
    async (base) => {
      const { id } = await json<PublicSeries>(await post(base, valid));

      for (const cookie of [
        ROLE_COOKIES.admin,
        ROLE_COOKIES.superadmin,
        ROLE_COOKIES.otherAuthor,
      ]) {
        assert.equal(
          (await addCoAuthor(base, id, USER_IDS.otherAuthor, cookie)).status,
          403
        );
        assert.equal(
          (await removeCoAuthor(base, id, KNOWN_USER_ID, cookie)).status,
          403
        );
      }
    }
  );
});

test('changing series co-authors without a session is 401', async () => {
  await withApp({ seriesRepository: createFakeRepository() }, async (base) => {
    assert.equal((await addCoAuthor(base, 1, 2, null)).status, 401);
    assert.equal((await removeCoAuthor(base, 1, 2, null)).status, 401);
  });
});

// --- Taking a book out of a series from the series' side. ---

test('a series co-author takes a book out of the series', async () => {
  await withAuthenticatedApp(
    { seriesRepository: createFakeRepository() },
    async (base) => {
      const { id } = await json<PublicSeries>(await post(base, valid));
      await addCoAuthor(base, id, USER_IDS.otherAuthor);

      const response = await removeBook(
        base,
        id,
        FILED_BOOK_ID,
        ROLE_COOKIES.otherAuthor
      );
      assert.equal(response.status, 204);
      // Gone from the series now, so a second attempt has nothing to unlink.
      assert.equal((await removeBook(base, id, FILED_BOOK_ID)).status, 404);
    }
  );
});

test('a moderator may take a book out of any series', async () => {
  await withAuthenticatedApp(
    { seriesRepository: createFakeRepository() },
    async (base) => {
      const { id } = await json<PublicSeries>(await post(base, valid));

      const response = await removeBook(
        base,
        id,
        FILED_BOOK_ID,
        ROLE_COOKIES.admin
      );
      assert.equal(response.status, 204);
    }
  );
});

test('an author who is not credited on the series may not take a book out', async () => {
  await withAuthenticatedApp(
    { seriesRepository: createFakeRepository() },
    async (base) => {
      const { id } = await json<PublicSeries>(await post(base, valid));

      assert.equal(
        (await removeBook(base, id, FILED_BOOK_ID, ROLE_COOKIES.otherAuthor))
          .status,
        403
      );
      assert.equal((await removeBook(base, 999, FILED_BOOK_ID)).status, 404);
      assert.equal(
        (await removeBook(base, id, FILED_BOOK_ID, null)).status,
        401
      );
    }
  );
});
