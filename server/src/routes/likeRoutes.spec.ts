import test from 'node:test';
import assert from 'node:assert/strict';
import { ConflictError, NotFoundError } from '../types/errors.ts';
import type {
  LikeListResult,
  LikeRepository,
} from '../repositories/likeRepository.ts';
import type { PublicLike } from '../types/like.ts';
import { json, withApp } from './routeTestKit.testkit.ts';

const KNOWN_USER_ID = 1;
const KNOWN_BOOK_ID = 1;
const KNOWN_COMMENT_ID = 1;

function createFakeRepository(): LikeRepository {
  const rows = new Map<number, PublicLike>();
  let nextId = 1;

  return {
    async create(input) {
      // Stands in for the three foreign keys: the real repository maps MySQL's
      // rejection to these same NotFoundErrors, reading the constraint text to
      // tell them apart.
      if (input.userId !== KNOWN_USER_ID) {
        throw new NotFoundError('User', input.userId);
      }
      if (input.bookId !== null && input.bookId !== KNOWN_BOOK_ID) {
        throw new NotFoundError('Book', input.bookId);
      }
      if (input.commentId !== null && input.commentId !== KNOWN_COMMENT_ID) {
        throw new NotFoundError('Comment', input.commentId);
      }
      // Stands in for the unique indexes on (userId, bookId) and
      // (userId, commentId).
      const taken = [...rows.values()].some(
        (row) =>
          row.userId === input.userId &&
          row.bookId === input.bookId &&
          row.commentId === input.commentId
      );
      if (taken) throw new ConflictError('like');

      const like: PublicLike = {
        id: nextId,
        userId: input.userId,
        bookId: input.bookId,
        commentId: input.commentId,
        isLike: input.isLike,
        createdAt: new Date(),
      };
      nextId += 1;
      rows.set(like.id, like);
      return like;
    },

    async list(query): Promise<LikeListResult> {
      const all = [...rows.values()].filter(
        (row) =>
          (query.userId === undefined || row.userId === query.userId) &&
          (query.bookId === undefined || row.bookId === query.bookId) &&
          (query.commentId === undefined ||
            row.commentId === query.commentId) &&
          (query.isLike === undefined || row.isLike === query.isLike)
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

      const updated: PublicLike = { ...current, isLike: input.isLike };
      rows.set(id, updated);
      return updated;
    },

    async remove(id) {
      return rows.delete(id);
    },
  };
}

const onBook = {
  userId: KNOWN_USER_ID,
  bookId: KNOWN_BOOK_ID,
  isLike: true,
};

const post = (base: string, body: unknown) =>
  fetch(`${base}/api/likes`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

const patch = (base: string, id: number, body: unknown) =>
  fetch(`${base}/api/likes/${id}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

const remove = (base: string, id: number) =>
  fetch(`${base}/api/likes/${id}`, { method: 'DELETE' });

test('POST creates a like on a book and leaves commentId null', async () => {
  await withApp({ likeRepository: createFakeRepository() }, async (base) => {
    const response = await post(base, onBook);
    const body = await json<PublicLike>(response);

    assert.equal(response.status, 201);
    assert.equal(body.bookId, KNOWN_BOOK_ID);
    assert.equal(body.commentId, null);
    assert.equal(body.isLike, true);
  });
});

test('POST creates a dislike on a comment and leaves bookId null', async () => {
  await withApp({ likeRepository: createFakeRepository() }, async (base) => {
    const response = await post(base, {
      userId: KNOWN_USER_ID,
      commentId: KNOWN_COMMENT_ID,
      isLike: false,
    });
    const body = await json<PublicLike>(response);

    assert.equal(response.status, 201);
    assert.equal(body.bookId, null);
    assert.equal(body.commentId, KNOWN_COMMENT_ID);
    assert.equal(body.isLike, false);
  });
});

test('POST naming both a book and a comment is a 400', async () => {
  await withApp({ likeRepository: createFakeRepository() }, async (base) => {
    const response = await post(base, {
      ...onBook,
      commentId: KNOWN_COMMENT_ID,
    });

    assert.equal(response.status, 400);
    assert.match(
      (await json<{ error: string }>(response)).error,
      /validation/i
    );
  });
});

test('POST naming neither a book nor a comment is a 400', async () => {
  await withApp({ likeRepository: createFakeRepository() }, async (base) => {
    const response = await post(base, {
      userId: KNOWN_USER_ID,
      isLike: true,
    });

    assert.equal(response.status, 400);
  });
});

test('POST without isLike is a 400 — a like and a dislike differ', async () => {
  await withApp({ likeRepository: createFakeRepository() }, async (base) => {
    const response = await post(base, {
      userId: KNOWN_USER_ID,
      bookId: KNOWN_BOOK_ID,
    });

    assert.equal(response.status, 400);
  });
});

// Changing one's mind is a PATCH; a second POST is a conflict, not an upsert.
test('POST twice on the same target is a 409', async () => {
  await withApp({ likeRepository: createFakeRepository() }, async (base) => {
    await post(base, onBook);
    const response = await post(base, { ...onBook, isLike: false });

    assert.equal(response.status, 409);
  });
});

test('POST against an unknown book is a 404, not a 500', async () => {
  await withApp({ likeRepository: createFakeRepository() }, async (base) => {
    const response = await post(base, { ...onBook, bookId: 999 });

    assert.equal(response.status, 404);
    assert.match(
      (await json<{ error: string }>(response)).error,
      /Book 999 not found/
    );
  });
});

test('POST against an unknown comment names the comment, not the user', async () => {
  await withApp({ likeRepository: createFakeRepository() }, async (base) => {
    const response = await post(base, {
      userId: KNOWN_USER_ID,
      commentId: 999,
      isLike: true,
    });

    assert.equal(response.status, 404);
    assert.match(
      (await json<{ error: string }>(response)).error,
      /Comment 999 not found/
    );
  });
});

test('GET lists likes with the paging envelope', async () => {
  await withApp({ likeRepository: createFakeRepository() }, async (base) => {
    await post(base, onBook);

    const response = await fetch(`${base}/api/likes`);
    const body = await json<LikeListResult & { limit: number; offset: number }>(
      response
    );

    assert.equal(response.status, 200);
    assert.equal(body.total, 1);
    assert.equal(body.limit, 20);
    assert.equal(body.offset, 0);
  });
});

// The end-to-end version of the stringbool test in types/like.spec.ts: with
// z.coerce.boolean() this returns the like as well, because Boolean("false")
// is true.
test('GET ?isLike=false returns dislikes, not everything', async () => {
  await withApp({ likeRepository: createFakeRepository() }, async (base) => {
    await post(base, onBook);
    await post(base, {
      userId: KNOWN_USER_ID,
      commentId: KNOWN_COMMENT_ID,
      isLike: false,
    });

    const response = await fetch(`${base}/api/likes?isLike=false`);
    const body = await json<LikeListResult>(response);

    assert.equal(body.total, 1);
    assert.equal(body.items[0]?.isLike, false);
  });
});

test('GET ?bookId= filters to one target', async () => {
  await withApp({ likeRepository: createFakeRepository() }, async (base) => {
    await post(base, onBook);
    await post(base, {
      userId: KNOWN_USER_ID,
      commentId: KNOWN_COMMENT_ID,
      isLike: true,
    });

    const body = await json<LikeListResult>(
      await fetch(`${base}/api/likes?bookId=${KNOWN_BOOK_ID}`)
    );

    assert.equal(body.total, 1);
    assert.equal(body.items[0]?.bookId, KNOWN_BOOK_ID);
  });
});

test('GET /:id returns one like, and 404 when it is not there', async () => {
  await withApp({ likeRepository: createFakeRepository() }, async (base) => {
    const created = await json<PublicLike>(await post(base, onBook));

    const found = await fetch(`${base}/api/likes/${created.id}`);
    const missing = await fetch(`${base}/api/likes/999`);

    assert.equal(found.status, 200);
    assert.equal((await json<PublicLike>(found)).id, created.id);
    assert.equal(missing.status, 404);
  });
});

test('GET /:id rejects a non-numeric id with 400', async () => {
  await withApp({ likeRepository: createFakeRepository() }, async (base) => {
    assert.equal((await fetch(`${base}/api/likes/abc`)).status, 400);
  });
});

test('PATCH flips a like into a dislike', async () => {
  await withApp({ likeRepository: createFakeRepository() }, async (base) => {
    const created = await json<PublicLike>(await post(base, onBook));

    const response = await patch(base, created.id, { isLike: false });

    assert.equal(response.status, 200);
    assert.equal((await json<PublicLike>(response)).isLike, false);
  });
});

test('PATCH with an empty body is a 400 — isLike is the only field', async () => {
  await withApp({ likeRepository: createFakeRepository() }, async (base) => {
    const created = await json<PublicLike>(await post(base, onBook));

    assert.equal((await patch(base, created.id, {})).status, 400);
  });
});

// Re-targeting is a re-parenting operation, not a field edit: the extra key is
// stripped by the schema rather than applied.
test('PATCH cannot move a like to another target', async () => {
  await withApp({ likeRepository: createFakeRepository() }, async (base) => {
    const created = await json<PublicLike>(await post(base, onBook));

    const response = await patch(base, created.id, {
      isLike: false,
      bookId: 999,
      commentId: KNOWN_COMMENT_ID,
    });

    const body = await json<PublicLike>(response);
    assert.equal(response.status, 200);
    assert.equal(body.bookId, KNOWN_BOOK_ID);
    assert.equal(body.commentId, null);
  });
});

test('PATCH on a like that is not there is a 404', async () => {
  await withApp({ likeRepository: createFakeRepository() }, async (base) => {
    assert.equal((await patch(base, 999, { isLike: false })).status, 404);
  });
});

test('DELETE removes a like, and repeating it is a 404', async () => {
  await withApp({ likeRepository: createFakeRepository() }, async (base) => {
    const created = await json<PublicLike>(await post(base, onBook));

    assert.equal((await remove(base, created.id)).status, 204);
    assert.equal((await remove(base, created.id)).status, 404);
  });
});
