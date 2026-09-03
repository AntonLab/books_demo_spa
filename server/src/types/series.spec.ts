import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createSeriesSchema,
  listSeriesQuerySchema,
  updateSeriesSchema,
} from './series.ts';

const valid = { userId: 1, description: 'A space opera', tags: ['sci-fi'] };

test('tags default to an empty array, since the JSON column has no DDL default', () => {
  const parsed = createSeriesSchema.parse({
    userId: 1,
    description: 'A space opera',
  });

  assert.deepEqual(parsed.tags, []);
});

test('duplicate tags collapse, and order is preserved', () => {
  const parsed = createSeriesSchema.parse({
    ...valid,
    tags: ['epic', 'sci-fi', 'epic'],
  });

  assert.deepEqual(parsed.tags, ['epic', 'sci-fi']);
});

test('tags are trimmed before deduplication', () => {
  const parsed = createSeriesSchema.parse({
    ...valid,
    tags: [' epic ', 'epic'],
  });

  assert.deepEqual(parsed.tags, ['epic']);
});

test('an empty tag is rejected rather than silently dropped', () => {
  assert.throws(() => createSeriesSchema.parse({ ...valid, tags: ['  '] }));
});

test('more than 20 tags is rejected', () => {
  const tags = Array.from({ length: 21 }, (_, i) => `tag-${i}`);

  assert.throws(() => createSeriesSchema.parse({ ...valid, tags }));
});

test('an empty description is rejected', () => {
  assert.throws(() => createSeriesSchema.parse({ ...valid, description: '' }));
});

test('userId must be a positive integer', () => {
  assert.throws(() => createSeriesSchema.parse({ ...valid, userId: 0 }));
  assert.throws(() => createSeriesSchema.parse({ ...valid, userId: -1 }));
});

test('an update cannot move a series to another user', () => {
  const parsed = updateSeriesSchema.parse({
    description: 'Rewritten',
    userId: 99,
  });

  assert.equal('userId' in parsed, false);
});

test('an update with no known field is rejected', () => {
  assert.throws(() => updateSeriesSchema.parse({}));
  assert.throws(() => updateSeriesSchema.parse({ userId: 99 }));
});

test('an update omitting tags leaves them absent rather than defaulting to []', () => {
  const parsed = updateSeriesSchema.parse({ description: 'Rewritten' });

  assert.equal(parsed.tags, undefined);
  assert.equal('tags' in parsed, false);
});

test('the list query coerces strings and applies paging defaults', () => {
  const parsed = listSeriesQuerySchema.parse({ userId: '7', tag: 'epic' });

  assert.deepEqual(parsed, {
    limit: 20,
    offset: 0,
    userId: 7,
    tag: 'epic',
  });
});

test('the list query caps the page size at 100', () => {
  assert.throws(() => listSeriesQuerySchema.parse({ limit: '101' }));
});
