import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createBookSchema,
  listBooksQuerySchema,
  updateBookSchema,
} from './book.ts';

test('createBookSchema requires a title', () => {
  const result = createBookSchema.safeParse({
    userId: 1,
    description: 'A tale',
  });
  assert.equal(result.success, false);
});

test('createBookSchema trims the title', () => {
  const result = createBookSchema.parse({
    userId: 1,
    title: '  Dragons  ',
    description: 'A tale',
  });
  assert.equal(result.title, 'Dragons');
});

test('createBookSchema rejects a whitespace-only title', () => {
  const result = createBookSchema.safeParse({
    userId: 1,
    title: '   ',
    description: 'A tale',
  });
  assert.equal(result.success, false);
});

test('updateBookSchema accepts a title alone', () => {
  const result = updateBookSchema.parse({ title: 'Dragons' });
  assert.deepEqual(result, { title: 'Dragons' });
});

test('createBookSchema leaves genreId out entirely when it is absent', () => {
  const result = createBookSchema.parse({
    title: 'Dragons',
    description: 'A tale',
  });

  assert.equal('genreId' in result, false);
});

test('createBookSchema takes a genreId, coerced, or an explicit null', () => {
  assert.equal(
    createBookSchema.parse({ title: 'D', description: 'A', genreId: '4' })
      .genreId,
    4
  );
  assert.equal(
    createBookSchema.parse({ title: 'D', description: 'A', genreId: null })
      .genreId,
    null
  );
  assert.equal(
    createBookSchema.safeParse({ title: 'D', description: 'A', genreId: 0 })
      .success,
    false
  );
});

// A6: .partial() must not turn an absent key into null, or a PATCH that only
// renames a book would clear its Genre.
test('updateBookSchema keeps an absent genreId absent and an explicit null null', () => {
  assert.deepEqual(updateBookSchema.parse({ title: 'Dragons' }), {
    title: 'Dragons',
  });
  assert.deepEqual(updateBookSchema.parse({ genreId: null }), {
    genreId: null,
  });
  assert.deepEqual(updateBookSchema.parse({ genreId: '4' }), { genreId: 4 });
});

test('listBooksQuerySchema takes genreId as a filter', () => {
  assert.equal(listBooksQuerySchema.parse({ genreId: '4' }).genreId, 4);
  assert.equal(listBooksQuerySchema.parse({}).genreId, undefined);
});

test('listBooksQuerySchema pages by current and pageSize, defaulting to page 1 of 20', () => {
  const parsed = listBooksQuerySchema.parse({});
  assert.equal(parsed.current, 1);
  assert.equal(parsed.pageSize, 20);
  assert.deepEqual(
    (({ current, pageSize }) => ({ current, pageSize }))(
      listBooksQuerySchema.parse({ current: '3', pageSize: '100' })
    ),
    { current: 3, pageSize: 100 }
  );
  for (const bad of [
    { current: '0' },
    { current: '1.5' },
    { pageSize: '0' },
    { pageSize: '101' },
  ]) {
    assert.equal(listBooksQuerySchema.safeParse(bad).success, false);
  }
});

test('listBooksQuerySchema trims text filters and refuses a blank or over-long one', () => {
  const parsed = listBooksQuerySchema.parse({
    q: '  dragon ',
    author: ' ann ',
    seriesTitle: ' ash ',
  });
  assert.deepEqual(
    [parsed.q, parsed.author, parsed.seriesTitle],
    ['dragon', 'ann', 'ash']
  );
  for (const key of ['q', 'author', 'seriesTitle']) {
    assert.equal(
      listBooksQuerySchema.safeParse({ [key]: '   ' }).success,
      false
    );
    assert.equal(
      listBooksQuerySchema.safeParse({ [key]: 'a'.repeat(201) }).success,
      false
    );
  }
});

test('listBooksQuerySchema takes in_progress or complete, never draft', () => {
  assert.equal(
    listBooksQuerySchema.parse({ status: 'complete' }).status,
    'complete'
  );
  assert.equal(
    listBooksQuerySchema.safeParse({ status: 'draft' }).success,
    false
  );
});

test('listBooksQuerySchema reads each date bound as an instant and refuses a start after its end', () => {
  const parsed = listBooksQuerySchema.parse({
    releasedFrom: '2026-01-01T00:00:00.000Z',
    releasedTo: '2026-01-31T23:59:59.999Z',
    updatedTo: '2026-02-01T00:00:00+03:00',
  });
  assert.deepEqual(parsed.releasedFrom, new Date('2026-01-01T00:00:00.000Z'));
  assert.deepEqual(parsed.updatedTo, new Date('2026-01-31T21:00:00.000Z'));
  assert.equal(
    listBooksQuerySchema.safeParse({ releasedFrom: '2026-01-01' }).success,
    false
  );

  for (const [from, to] of [
    ['releasedFrom', 'releasedTo'],
    ['updatedFrom', 'updatedTo'],
  ] as const) {
    const result = listBooksQuerySchema.safeParse({
      [from]: '2026-02-01T00:00:00.000Z',
      [to]: '2026-01-01T00:00:00.000Z',
    });
    assert.equal(result.success, false);
    assert.deepEqual(result.error?.issues[0]?.path, [from]);
    // Either bound alone is an open range, and equal bounds are one instant.
    assert.equal(
      listBooksQuerySchema.safeParse({
        [from]: '2026-01-01T00:00:00.000Z',
        [to]: '2026-01-01T00:00:00.000Z',
      }).success,
      true
    );
  }
});
