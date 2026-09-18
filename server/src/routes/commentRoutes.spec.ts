import test from 'node:test';
import assert from 'node:assert/strict';
import type { CommentRepository } from '../repositories/commentRepository.ts';
import { createFakeCommentRepository } from '../repositories/commentRepository.fake.testkit.ts';
import type { CommentWithAuthor, PublicComment } from '../types/comment.ts';
import type { AuthorSummary } from '../types/user.ts';
import {
  AUTH_COOKIE,
  json,
  ROLE_COOKIES,
  TEST_USER,
  USER_IDS,
  withApp,
  withAuthenticatedApp,
} from './routeTestKit.testkit.ts';

const KNOWN_BOOK_ID = 1;
// Owned by a different user, which is what the 403 cases turn on: TEST_USER is
// id 1, and requirePermission resolves every authenticated request to them.
// This happens to equal 2, which routeTestKit's USER_IDS reserves for the
// `author` persona — no test here acts as that persona against a row owned
// by this id, so it does not change any test's meaning today, but a future
// author-vs-author test in this file must pick a different id.
const OTHER_USER_ID = TEST_USER.id + 1;
const FOREIGN_COMMENT_ID = 500;

const AUTHOR: AuthorSummary = {
  id: TEST_USER.id,
  login: TEST_USER.login,
  firstName: TEST_USER.firstName,
  lastName: TEST_USER.lastName,
  avatarUrl: null,
};

// Every persona a spec posts as, so a live comment's `author` is a real
// summary: TEST_USER's own for the default cookie.
const ACCOUNTS = new Map<number, AuthorSummary>(
  Object.values(USER_IDS).map((id) => [
    id,
    id === TEST_USER.id
      ? AUTHOR
      : {
          id,
          login: `persona-${id}`,
          firstName: 'Persona',
          lastName: `${id}`,
          avatarUrl: null,
        },
  ])
);

// Seeded rather than posted, because the API offers no way to create a
// comment as somebody else — which is the property under test. The fake never
// mutates a seeded row, so one object serves every fake.
const FOREIGN_COMMENT: PublicComment = {
  id: FOREIGN_COMMENT_ID,
  parentId: null,
  userId: OTHER_USER_ID,
  bookId: KNOWN_BOOK_ID,
  text: 'Not yours',
  tombstone: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const createFakeRepository = (): CommentRepository =>
  createFakeCommentRepository({
    accounts: ACCOUNTS,
    books: new Set([KNOWN_BOOK_ID]),
    seed: [FOREIGN_COMMENT],
    viewerLikeId: 42,
  });

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

const restore = (
  base: string,
  id: number,
  cookie: string | null = ROLE_COOKIES.admin
) =>
  fetch(`${base}/api/comments/${id}/restore`, {
    method: 'POST',
    headers: cookie ? { cookie } : {},
  });

const getOne = async (base: string, id: number): Promise<PublicComment> =>
  json<PublicComment>(await fetch(`${base}/api/comments/${id}`));

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
      assert.equal(body.items[0]?.author?.login, TEST_USER.login);
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

test('DELETE leaves the comment in the list as a tombstone', async () => {
  await withAuthenticatedApp(
    { commentRepository: createFakeRepository() },
    async (base) => {
      const created = await json<PublicComment>(await post(base, valid));
      await remove(base, created.id);

      const body = await json<{ items: CommentWithAuthor[] }>(
        await fetch(`${base}/api/comments?bookId=${KNOWN_BOOK_ID}`)
      );

      // Still there, so any replies keep a parent to hang off.
      const tombstone = body.items.find((item) => item.id === created.id);
      assert.notEqual(tombstone, undefined);
      assert.equal(tombstone?.tombstone, 'deleted');
      assert.equal(tombstone?.text, '');
      assert.equal(tombstone?.author, null);
      assert.equal(tombstone?.userId, null);
    }
  );
});

test('PATCH refuses a tombstone with 403, even for a moderator', async () => {
  await withAuthenticatedApp(
    { commentRepository: createFakeRepository() },
    async (base) => {
      const created = await json<PublicComment>(await post(base, valid));
      await remove(base, created.id);

      const response = await patch(base, created.id, { text: 'Back again' });
      assert.equal(response.status, 403);

      await remove(base, FOREIGN_COMMENT_ID, ROLE_COOKIES.admin);

      for (const cookie of [ROLE_COOKIES.admin, ROLE_COOKIES.superadmin]) {
        const moderated = await patch(
          base,
          FOREIGN_COMMENT_ID,
          { text: 'Back again' },
          cookie
        );
        assert.equal(moderated.status, 403);
      }
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

test('a moderator may not edit another user comment — moderators remove, they do not rewrite', async () => {
  await withAuthenticatedApp(
    { commentRepository: createFakeRepository() },
    async (base) => {
      for (const cookie of [ROLE_COOKIES.admin, ROLE_COOKIES.superadmin]) {
        const response = await patch(
          base,
          FOREIGN_COMMENT_ID,
          { text: 'Moderated' },
          cookie
        );
        assert.equal(response.status, 403);
      }
      assert.equal((await getOne(base, FOREIGN_COMMENT_ID)).text, 'Not yours');
    }
  );
});

test('an admin may still edit their own comment', async () => {
  await withAuthenticatedApp(
    { commentRepository: createFakeRepository() },
    async (base) => {
      const created = await json<PublicComment>(
        await post(base, valid, ROLE_COOKIES.admin)
      );
      const response = await patch(
        base,
        created.id,
        { text: 'Second thoughts' },
        ROLE_COOKIES.admin
      );
      assert.equal(response.status, 200);
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

test('DELETE by the owner leaves a deleted tombstone', async () => {
  await withAuthenticatedApp(
    { commentRepository: createFakeRepository() },
    async (base) => {
      const created = await json<PublicComment>(await post(base, valid));
      assert.equal((await remove(base, created.id)).status, 204);

      const tombstone = await getOne(base, created.id);
      assert.equal(tombstone.tombstone, 'deleted');
      assert.equal(tombstone.text, '');
      assert.equal(tombstone.userId, null);
    }
  );
});

test('an admin deleting another user comment leaves a removed tombstone', async () => {
  await withAuthenticatedApp(
    { commentRepository: createFakeRepository() },
    async (base) => {
      const response = await remove(
        base,
        FOREIGN_COMMENT_ID,
        ROLE_COOKIES.admin
      );
      assert.equal(response.status, 204);
      assert.equal(
        (await getOne(base, FOREIGN_COMMENT_ID)).tombstone,
        'removed'
      );
    }
  );
});

test('an admin deleting their own comment leaves a deleted tombstone, not a removed one', async () => {
  await withAuthenticatedApp(
    { commentRepository: createFakeRepository() },
    async (base) => {
      const created = await json<PublicComment>(
        await post(base, valid, ROLE_COOKIES.admin)
      );
      assert.equal(
        (await remove(base, created.id, ROLE_COOKIES.admin)).status,
        204
      );
      assert.equal((await getOne(base, created.id)).tombstone, 'deleted');
    }
  );
});

test('DELETE on a tombstone is 404, whoever asks', async () => {
  await withAuthenticatedApp(
    { commentRepository: createFakeRepository() },
    async (base) => {
      await remove(base, FOREIGN_COMMENT_ID, ROLE_COOKIES.admin);

      for (const cookie of [
        ROLE_COOKIES.admin,
        ROLE_COOKIES.superadmin,
        ROLE_COOKIES.user,
      ]) {
        const response = await remove(base, FOREIGN_COMMENT_ID, cookie);
        assert.equal(response.status, 404);
      }
    }
  );
});

test('a moderator restores a removed comment with its text and owner', async () => {
  await withAuthenticatedApp(
    { commentRepository: createFakeRepository() },
    async (base) => {
      await remove(base, FOREIGN_COMMENT_ID, ROLE_COOKIES.admin);

      const response = await restore(base, FOREIGN_COMMENT_ID);
      assert.equal(response.status, 200);

      const restored = await json<PublicComment>(response);
      assert.equal(restored.tombstone, null);
      assert.equal(restored.text, 'Not yours');
      assert.equal(restored.userId, OTHER_USER_ID);
    }
  );
});

test('a superadmin may restore what an admin removed', async () => {
  await withAuthenticatedApp(
    { commentRepository: createFakeRepository() },
    async (base) => {
      await remove(base, FOREIGN_COMMENT_ID, ROLE_COOKIES.admin);

      const response = await restore(
        base,
        FOREIGN_COMMENT_ID,
        ROLE_COOKIES.superadmin
      );
      assert.equal(response.status, 200);
    }
  );
});

test('restore answers 404 for a deleted comment, a live one and a missing id', async () => {
  await withAuthenticatedApp(
    { commentRepository: createFakeRepository() },
    async (base) => {
      const created = await json<PublicComment>(await post(base, valid));
      await remove(base, created.id);

      assert.equal((await restore(base, created.id)).status, 404);
      assert.equal((await restore(base, FOREIGN_COMMENT_ID)).status, 404);
      assert.equal((await restore(base, 9_999)).status, 404);
    }
  );
});

test('a plain user may not restore a comment', async () => {
  await withAuthenticatedApp(
    { commentRepository: createFakeRepository() },
    async (base) => {
      await remove(base, FOREIGN_COMMENT_ID, ROLE_COOKIES.admin);

      const response = await restore(
        base,
        FOREIGN_COMMENT_ID,
        ROLE_COOKIES.user
      );
      assert.equal(response.status, 403);
      assert.equal(
        (await getOne(base, FOREIGN_COMMENT_ID)).tombstone,
        'removed'
      );
    }
  );
});

test('restore without a session is 401', async () => {
  await withApp({ commentRepository: createFakeRepository() }, async (base) => {
    assert.equal((await restore(base, FOREIGN_COMMENT_ID, null)).status, 401);
  });
});

test('GET ?userId= leaves tombstones out, so the filter cannot name their owners', async () => {
  await withAuthenticatedApp(
    { commentRepository: createFakeRepository() },
    async (base) => {
      await remove(base, FOREIGN_COMMENT_ID, ROLE_COOKIES.admin);

      const body = await json<{ items: CommentWithAuthor[]; total: number }>(
        await fetch(`${base}/api/comments?userId=${OTHER_USER_ID}`)
      );
      assert.deepEqual(body.items, []);
      assert.equal(body.total, 0);
    }
  );
});
