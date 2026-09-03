import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createLikeSchema,
  listLikesQuerySchema,
  updateLikeSchema,
} from './like.ts';

test('a like on a book parses, and the unused target defaults to null', () => {
  const parsed = createLikeSchema.parse({ userId: 1, bookId: 2, isLike: true });

  assert.deepEqual(parsed, {
    userId: 1,
    bookId: 2,
    commentId: null,
    isLike: true,
  });
});

test('a like on a comment parses, and the unused target defaults to null', () => {
  const parsed = createLikeSchema.parse({
    userId: 1,
    commentId: 3,
    isLike: false,
  });

  assert.deepEqual(parsed, {
    userId: 1,
    bookId: null,
    commentId: 3,
    isLike: false,
  });
});

test('naming both targets is rejected — a like points at one thing', () => {
  assert.throws(() =>
    createLikeSchema.parse({ userId: 1, bookId: 2, commentId: 3, isLike: true })
  );
});

test('naming neither target is rejected', () => {
  assert.throws(() => createLikeSchema.parse({ userId: 1, isLike: true }));
});

// The nullable default is what makes an omitted key null, so an explicitly
// null key has to fail the same way an omitted one does.
test('spelling both targets out as null is rejected too', () => {
  assert.throws(() =>
    createLikeSchema.parse({
      userId: 1,
      bookId: null,
      commentId: null,
      isLike: true,
    })
  );
});

test('isLike is required — a like and a dislike are not the same row', () => {
  assert.throws(() => createLikeSchema.parse({ userId: 1, bookId: 2 }));
});

test('updateLikeSchema requires isLike, so an empty body is rejected', () => {
  assert.throws(() => updateLikeSchema.parse({}));
});

// Re-targeting is a re-parenting operation, not a field edit, so the update
// schema has no target keys at all and zod strips them.
test('an update cannot move a like to another target', () => {
  const parsed = updateLikeSchema.parse({ isLike: false, bookId: 9 });

  assert.deepEqual(parsed, { isLike: false });
});

test('the list query defaults limit and offset', () => {
  const parsed = listLikesQuerySchema.parse({});

  assert.equal(parsed.limit, 20);
  assert.equal(parsed.offset, 0);
  assert.equal(parsed.isLike, undefined);
});

// z.coerce.boolean() would read the *string* "false" as true and silently
// return likes when the caller asked for dislikes; stringbool is what keeps
// ?isLike=false meaning what it says.
test('?isLike=false filters dislikes rather than coercing to true', () => {
  assert.equal(listLikesQuerySchema.parse({ isLike: 'false' }).isLike, false);
  assert.equal(listLikesQuerySchema.parse({ isLike: 'true' }).isLike, true);
});

test('the list filters coerce their ids from the query string', () => {
  const parsed = listLikesQuerySchema.parse({
    userId: '1',
    bookId: '2',
    commentId: '3',
  });

  assert.deepEqual([parsed.userId, parsed.bookId, parsed.commentId], [1, 2, 3]);
});
