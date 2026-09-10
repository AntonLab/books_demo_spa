import test from 'node:test';
import assert from 'node:assert/strict';
import {
  COMMENT_TEXT_MAX_LENGTH,
  createCommentSchema,
  listCommentsQuerySchema,
  updateCommentSchema,
} from './comment.ts';

test('createCommentSchema requires a book and text', () => {
  assert.equal(createCommentSchema.safeParse({}).success, false);
  assert.equal(createCommentSchema.safeParse({ bookId: 1 }).success, false);
  assert.equal(createCommentSchema.safeParse({ text: 'Nice' }).success, false);
});

test('createCommentSchema defaults parentId to null for a top-level comment', () => {
  const result = createCommentSchema.parse({ bookId: 1, text: 'Nice' });

  assert.equal(result.parentId, null);
});

test('createCommentSchema treats an explicit null parentId the same as an omitted one', () => {
  const result = createCommentSchema.parse({
    bookId: 1,
    parentId: null,
    text: 'Nice',
  });

  assert.equal(result.parentId, null);
});

test('createCommentSchema drops a userId supplied in the body', () => {
  // The author comes from the session. If the body could name one, "you may
  // only edit your own comment" would mean nothing.
  const result = createCommentSchema.parse({
    bookId: 1,
    text: 'Nice',
    userId: 42,
  });

  assert.equal('userId' in result, false);
});

test('createCommentSchema rejects an empty text', () => {
  assert.equal(
    createCommentSchema.safeParse({ bookId: 1, text: '' }).success,
    false
  );
});

test('createCommentSchema rejects text past the limit', () => {
  const result = createCommentSchema.safeParse({
    bookId: 1,
    text: 'x'.repeat(COMMENT_TEXT_MAX_LENGTH + 1),
  });

  assert.equal(result.success, false);
});

test('createCommentSchema keeps the text untrimmed', () => {
  // Paragraph breaks and indentation are part of what someone wrote, unlike a
  // title's stray whitespace.
  const result = createCommentSchema.parse({
    bookId: 1,
    text: '  spaced  ',
  });

  assert.equal(result.text, '  spaced  ');
});

test('updateCommentSchema requires the text and rejects an empty body', () => {
  assert.equal(updateCommentSchema.safeParse({}).success, false);
  assert.equal(updateCommentSchema.parse({ text: 'Edited' }).text, 'Edited');
});

test('updateCommentSchema cannot re-parent a comment', () => {
  const result = updateCommentSchema.parse({
    text: 'Edited',
    bookId: 99,
    parentId: 99,
  });

  assert.equal('bookId' in result, false);
  assert.equal('parentId' in result, false);
});

test('listCommentsQuerySchema applies paging defaults and coerces filters', () => {
  const result = listCommentsQuerySchema.parse({ bookId: '7' });

  assert.deepEqual(result, { limit: 20, offset: 0, bookId: 7 });
});

test('listCommentsQuerySchema caps the page size at 100', () => {
  assert.equal(
    listCommentsQuerySchema.safeParse({ limit: 101 }).success,
    false
  );
});
