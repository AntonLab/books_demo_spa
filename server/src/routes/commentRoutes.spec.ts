import test from 'node:test';
import assert from 'node:assert/strict';
import { NotFoundError } from '../types/errors.ts';
import type {
  CommentListResult,
  CommentRepository,
} from '../repositories/commentRepository.ts';
import type { CommentWithAuthor, PublicComment } from '../types/comment.ts';
import type { AuthorSummary } from '../types/user.ts';
import {
  AUTH_COOKIE,
  json,
  ROLE_COOKIES,
  TEST_USER,
  withApp,
  withAuthenticatedApp,
} from './routeTestKit.testkit.ts';

const KNOWN_BOOK_ID = 1;
// Owned by a different user, which is what the 403 cases turn on: TEST_USER is
// id 1, and requireAuth resolves every authenticated request to them.
const OTHER_USER_ID = TEST_USER.id + 1;
const FOREIGN_COMMENT_ID = 500;

const AUTHOR: AuthorSummary = {
  id: TEST_USER.id,
  login: TEST_USER.login,
  firstName: TEST_USER.firstName,
  lastName: TEST_USER.lastName,
};

function createFakeRepository(): CommentRepository {
  const rows = new Map<number, PublicComment>();
  let nextId = 1;

  const now = new Date();
  // Seeded rather than posted, because the API offers no way to create a
  // comment as somebody else — which is the property under test.
  rows.set(FOREIGN_COMMENT_ID, {
    id: FOREIGN_COMMENT_ID,
    parentId: null,
    userId: OTHER_USER_ID,
    bookId: KNOWN_BOOK_ID,
    text: 'Not yours',
    createdAt: now,
    updatedAt: now,
  });

  return {
    async create(input, actorId) {
      // Stands in for the foreign key: the real repository maps MySQL's
      // rejection to this same NotFoundError.
      if (input.bookId !== KNOWN_BOOK_ID) {
        throw new NotFoundError('Book', input.bookId);
      }

      const created = new Date();
      const comment: PublicComment = {
        id: nextId,
        parentId: input.parentId,
        userId: actorId,
        bookId: input.bookId,
        text: input.text,
        createdAt: created,
        updatedAt: created,
      };
      nextId += 1;
      rows.set(comment.id, comment);
      return comment;
    },

    async list(query, viewerId): Promise<CommentListResult> {
      const all = [...rows.values()].filter(
        (row) =>
          (query.bookId === undefined || row.bookId === query.bookId) &&
          (query.userId === undefined || row.userId === query.userId) &&
          (query.parentId === undefined || row.parentId === query.parentId)
      );

      return {
        items: all
          .slice(query.offset, query.offset + query.limit)
          .map((row): CommentWithAuthor => ({
            ...row,
            author: AUTHOR,
            likeCount: 0,
            // Mirrors the real repository: only a signed-in caller can have a
            // like of their own to report.
            viewerLikeId: viewerId === null ? null : 42,
          })),
        total: all.length,
      };
    },

    async findById(id) {
      return rows.get(id) ?? null;
    },

    async update(id, input) {
      const current = rows.get(id);
      if (!current) return null;

      const updated: PublicComment = {
        ...current,
        text: input.text,
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

const post = (
  base: string,
  body: unknown,
  cookie: string | null = AUTH_COOKIE
) =>
  fetch(`${base}/api/comments`, {
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
  fetch(`${base}/api/comments/${id}`, {
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
  fetch(`${base}/api/comments/${id}`, {
    method: 'DELETE',
    headers: cookie ? { cookie } : {},
  });

const valid = { bookId: KNOWN_BOOK_ID, text: 'A fine book' };

test('POST creates a comment owned by the session user', async () => {
  await withAuthenticatedApp(
    { commentRepository: createFakeRepository() },
    async (base) => {
      const response = await post(base, valid);
      assert.equal(response.status, 201);

      const body = await json<PublicComment>(response);
      assert.equal(body.userId, TEST_USER.id);
      assert.equal(body.parentId, null);
    }
  );
});

test('POST ignores a userId supplied in the body', async () => {
  await withAuthenticatedApp(
    { commentRepository: createFakeRepository() },
    async (base) => {
      const response = await post(base, { ...valid, userId: 999 });
      assert.equal(response.status, 201);

      // The author comes from the session cookie, so the body cannot claim one.
      assert.equal((await json<PublicComment>(response)).userId, TEST_USER.id);
    }
  );
});

test('POST accepts a reply and keeps its parent', async () => {
  await withAuthenticatedApp(
    { commentRepository: createFakeRepository() },
    async (base) => {
      const root = await json<PublicComment>(await post(base, valid));
      const reply = await json<PublicComment>(
        await post(base, { ...valid, parentId: root.id, text: 'Agreed' })
      );

      assert.equal(reply.parentId, root.id);
    }
  );
});

test('POST against an unknown book is a 404, not a 500', async () => {
  await withAuthenticatedApp(
    { commentRepository: createFakeRepository() },
    async (base) => {
      const response = await post(base, { ...valid, bookId: 9999 });
      assert.equal(response.status, 404);
    }
  );
});

test('POST rejects an empty text with 400', async () => {
  await withAuthenticatedApp(
    { commentRepository: createFakeRepository() },
    async (base) => {
      const response = await post(base, { ...valid, text: '' });
      assert.equal(response.status, 400);
    }
  );
});

test('POST without a session is 401', async () => {
  await withApp({ commentRepository: createFakeRepository() }, async (base) => {
    assert.equal((await post(base, valid, null)).status, 401);
  });
});

test('GET list stays public and reports no viewer like for an anonymous reader', async () => {
  await withAuthenticatedApp(
    { commentRepository: createFakeRepository() },
    async (base) => {
      await post(base, valid);

      const response = await fetch(
        `${base}/api/comments?bookId=${KNOWN_BOOK_ID}`
      );
      assert.equal(response.status, 200);

      const body = await json<{ items: CommentWithAuthor[]; total: number }>(
        response
      );
      assert.equal(body.items[0]?.author.login, TEST_USER.login);
      assert.equal(body.items[0]?.viewerLikeId, null);
    }
  );
});

test('GET list reports the viewer own like when a session cookie is sent', async () => {
  await withAuthenticatedApp(
    { commentRepository: createFakeRepository() },
    async (base) => {
      await post(base, valid);

      const response = await fetch(
        `${base}/api/comments?bookId=${KNOWN_BOOK_ID}`,
        { headers: { cookie: AUTH_COOKIE } }
      );

      const body = await json<{ items: CommentWithAuthor[] }>(response);
      assert.equal(body.items[0]?.viewerLikeId, 42);
    }
  );
});

test('GET by id returns 404 for a missing record', async () => {
  await withApp({ commentRepository: createFakeRepository() }, async (base) => {
    assert.equal((await fetch(`${base}/api/comments/9999`)).status, 404);
  });
});

test('PATCH rewrites your own comment', async () => {
  await withAuthenticatedApp(
    { commentRepository: createFakeRepository() },
    async (base) => {
      const created = await json<PublicComment>(await post(base, valid));

      const response = await patch(base, created.id, { text: 'Edited' });
      assert.equal(response.status, 200);
      assert.equal((await json<PublicComment>(response)).text, 'Edited');
    }
  );
});

test('PATCH refuses another user comment with 403', async () => {
  await withAuthenticatedApp(
    { commentRepository: createFakeRepository() },
    async (base) => {
      const response = await patch(base, FOREIGN_COMMENT_ID, {
        text: 'Edited',
      });
      assert.equal(response.status, 403);
    }
  );
});

test('PATCH on a missing record is a 404', async () => {
  await withAuthenticatedApp(
    { commentRepository: createFakeRepository() },
    async (base) => {
      assert.equal((await patch(base, 9999, { text: 'Edited' })).status, 404);
    }
  );
});

test('PATCH without a session is 401', async () => {
  await withApp({ commentRepository: createFakeRepository() }, async (base) => {
    const response = await patch(base, 1, { text: 'Edited' }, null);
    assert.equal(response.status, 401);
  });
});

test('DELETE removes your own comment', async () => {
  await withAuthenticatedApp(
    { commentRepository: createFakeRepository() },
    async (base) => {
      const created = await json<PublicComment>(await post(base, valid));

      assert.equal((await remove(base, created.id)).status, 204);
      assert.equal((await remove(base, created.id)).status, 404);
    }
  );
});

test('DELETE refuses another user comment with 403', async () => {
  await withAuthenticatedApp(
    { commentRepository: createFakeRepository() },
    async (base) => {
      assert.equal((await remove(base, FOREIGN_COMMENT_ID)).status, 403);
    }
  );
});

test('DELETE without a session is 401', async () => {
  await withApp({ commentRepository: createFakeRepository() }, async (base) => {
    assert.equal((await remove(base, 1, null)).status, 401);
  });
});

test('an admin may delete another user comment', async () => {
  // Comments were the first resource to check ownership, and until now nobody
  // could override it — which would leave a report with no possible outcome.
  await withAuthenticatedApp(
    { commentRepository: createFakeRepository() },
    async (base) => {
      const response = await remove(
        base,
        FOREIGN_COMMENT_ID,
        ROLE_COOKIES.admin
      );
      assert.equal(response.status, 204);
    }
  );
});

test('a plain user still may not touch another user comment', async () => {
  await withAuthenticatedApp(
    { commentRepository: createFakeRepository() },
    async (base) => {
      const response = await remove(
        base,
        FOREIGN_COMMENT_ID,
        ROLE_COOKIES.user
      );
      assert.equal(response.status, 403);
    }
  );
});

test('a plain user may still comment — roles accumulate', async () => {
  await withAuthenticatedApp(
    { commentRepository: createFakeRepository() },
    async (base) => {
      assert.equal((await post(base, valid, ROLE_COOKIES.user)).status, 201);
    }
  );
});
