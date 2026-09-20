import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createSeriesSchema,
  listSeriesQuerySchema,
  reorderSeriesBooksSchema,
  updateSeriesSchema,
} from './series.ts';

// No userId: the owner comes from the session, never the body.
const valid = {
  title: 'A Space Opera',
  description: 'A space opera',
  tags: ['sci-fi'],
};

test('tags default to an empty array, since the JSON column has no DDL default', () => {
  const parsed = createSeriesSchema.parse({
    title: 'A Space Opera',
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

test('a series reorder names every book id once, in the new Series order', () => {
  assert.deepEqual(
    reorderSeriesBooksSchema.parse({ bookIds: [3, 1, 2] }).bookIds,
    [3, 1, 2]
  );
});

test('a series reorder refuses an empty list, a repeated id, or an id that is not one', () => {
  for (const bookIds of [[], [1, 1], [0], [1.5], ['x'], undefined]) {
    assert.equal(
      reorderSeriesBooksSchema.safeParse({ bookIds }).success,
      false,
      JSON.stringify(bookIds)
    );
  }
});

test('createSeriesSchema leaves genreId out entirely when it is absent', () => {
  assert.equal('genreId' in createSeriesSchema.parse(valid), false);
});

test('createSeriesSchema takes a genreId, coerced, or an explicit null', () => {
  assert.equal(createSeriesSchema.parse({ ...valid, genreId: '4' }).genreId, 4);
  assert.equal(
    createSeriesSchema.parse({ ...valid, genreId: null }).genreId,
    null
  );
  assert.equal(
    createSeriesSchema.safeParse({ ...valid, genreId: 0 }).success,
    false
  );
});

// A6: .partial() must not turn an absent key into null, or a PATCH that only
// renames a series would clear its Genre.
test('updateSeriesSchema keeps an absent genreId absent and an explicit null null', () => {
  assert.deepEqual(updateSeriesSchema.parse({ title: 'Renamed' }), {
    title: 'Renamed',
  });
  assert.deepEqual(updateSeriesSchema.parse({ genreId: null }), {
    genreId: null,
  });
  assert.deepEqual(updateSeriesSchema.parse({ genreId: '4' }), { genreId: 4 });
});

test('listSeriesQuerySchema takes genreId as a filter', () => {
  assert.equal(listSeriesQuerySchema.parse({ genreId: '4' }).genreId, 4);
  assert.equal(listSeriesQuerySchema.parse({}).genreId, undefined);
});
