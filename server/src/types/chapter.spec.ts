import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CHAPTER_TEXT_MAX_LENGTH,
  CHAPTER_TITLE_MAX_LENGTH,
  createChapterSchema,
  listChaptersQuerySchema,
  updateChapterSchema,
} from './chapter.ts';

const valid = { bookId: 1, title: 'Chapter One', text: 'It was a dark night.' };

test('a title is trimmed, so stray whitespace never reaches the summary list', () => {
  const parsed = createChapterSchema.parse({ ...valid, title: '  Prologue  ' });

  assert.equal(parsed.title, 'Prologue');
});

test('a whitespace-only title is rejected rather than silently emptied', () => {
  assert.throws(() => createChapterSchema.parse({ ...valid, title: '   ' }));
});

test('text is left untrimmed — leading whitespace in a body can be deliberate', () => {
  const parsed = createChapterSchema.parse({ ...valid, text: '  indented' });

  assert.equal(parsed.text, '  indented');
});

test('an empty text is rejected', () => {
  assert.throws(() => createChapterSchema.parse({ ...valid, text: '' }));
});

test('a title one character past the column width is rejected', () => {
  const atLimit = 'x'.repeat(CHAPTER_TITLE_MAX_LENGTH);

  assert.equal(
    createChapterSchema.parse({ ...valid, title: atLimit }).title,
    atLimit
  );
  assert.throws(() =>
    createChapterSchema.parse({ ...valid, title: `${atLimit}x` })
  );
});

test('text one character past the cap is rejected, well inside MEDIUMTEXT', () => {
  const atLimit = 'x'.repeat(CHAPTER_TEXT_MAX_LENGTH);

  assert.equal(
    createChapterSchema.parse({ ...valid, text: atLimit }).text.length,
    CHAPTER_TEXT_MAX_LENGTH
  );
  assert.throws(() =>
    createChapterSchema.parse({ ...valid, text: `${atLimit}x` })
  );
});

test('bookId is required — a chapter cannot stand outside a book', () => {
  assert.throws(() =>
    createChapterSchema.parse({ title: 'Orphan', text: 'No book' })
  );
});

test('bookId is coerced, so a numeric string from a form body still parses', () => {
  assert.equal(createChapterSchema.parse({ ...valid, bookId: '7' }).bookId, 7);
});

test('an update with no fields at all is rejected', () => {
  assert.throws(() => updateChapterSchema.parse({}));
});

const seen = '2026-09-13T08:15:30.123Z';

test('an update may carry a title alone, leaving text absent rather than blank', () => {
  const parsed = updateChapterSchema.parse({
    title: 'Renamed',
    expectedUpdatedAt: seen,
  });

  assert.equal(parsed.title, 'Renamed');
  assert.ok(!('text' in parsed));
});

test('an update drops bookId — re-parenting a chapter is not a field edit', () => {
  const parsed = updateChapterSchema.parse({
    bookId: 9,
    title: 'Renamed',
    expectedUpdatedAt: seen,
  });

  assert.ok(!('bookId' in parsed));
});

test('an update must say which version it was based on', () => {
  assert.equal(
    updateChapterSchema.safeParse({ title: 'Renamed' }).success,
    false
  );
});

test('an update needs a change beyond the version it was based on', () => {
  assert.equal(
    updateChapterSchema.safeParse({ expectedUpdatedAt: seen }).success,
    false
  );
});

test('an update may leave publishedAt out, or set it to now, a moment or null', () => {
  assert.ok(
    !(
      'publishedAt' in
      updateChapterSchema.parse({ text: 'x', expectedUpdatedAt: seen })
    )
  );
  for (const publishedAt of ['now', '2030-01-01T10:00:00.000Z', null]) {
    assert.equal(
      updateChapterSchema.parse({ publishedAt, expectedUpdatedAt: seen })
        .publishedAt,
      publishedAt
    );
  }
});

test('a create is a draft unless it says otherwise', () => {
  assert.equal(
    createChapterSchema.parse({ bookId: 1, title: 'One', text: 'a' })
      .publishedAt,
    null
  );
});

test('the list query defaults limit and offset, and takes no text', () => {
  const parsed = listChaptersQuerySchema.parse({});

  assert.equal(parsed.limit, 20);
  assert.equal(parsed.offset, 0);
});

test('the list query coerces bookId from the query string', () => {
  assert.equal(listChaptersQuerySchema.parse({ bookId: '3' }).bookId, 3);
});
